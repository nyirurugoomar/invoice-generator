import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Invoice, InvoiceDocument, InvoiceStatus } from './schemas/invoice.schema';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import PDFDocument from 'pdfkit';
import type { Response } from 'express';

@Injectable()
export class InvoiceService {
  // Rwanda standard VAT rate
  private readonly RWANDA_VAT_RATE = 0.18; // 18%

  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
  ) {}

  /**
   * Calculate invoice totals with Rwanda tax logic
   * Rwanda VAT: 18% standard rate
   * Formula: Price = Taxable Amount + (Taxable Amount × 18%)
   */
  private calculateInvoiceTotals(dto: CreateInvoiceDto | UpdateInvoiceDto): CreateInvoiceDto | UpdateInvoiceDto {
    let subtotal = 0; // Total before any taxes or discounts
    let totalTax = 0; // Total VAT amount
    let totalDiscount = 0; // Total discount amount

    // Calculate totals for each line item
    const calculatedItems = dto.items?.map((item) => {
      // Step 1: Calculate base amount (quantity × unit price)
      const itemSubtotal = item.quantity * item.unitPrice;

      // Step 2: Apply item-level discount if any
      const itemDiscount = item.discount || 0;
      const itemAfterDiscount = itemSubtotal - itemDiscount;

      // Step 3: Calculate VAT on the discounted amount
      // Use item-specific tax rate if provided, otherwise use Rwanda standard 18%
      const itemTaxRate = item.taxRate !== undefined ? item.taxRate : this.RWANDA_VAT_RATE;
      const itemTaxAmount = itemAfterDiscount * itemTaxRate;

      // Step 4: Calculate final item total (Discounted Amount + VAT)
      const itemTotal = itemAfterDiscount + itemTaxAmount;

      // Add to running totals
      subtotal += itemSubtotal;
      totalDiscount += itemDiscount;
      totalTax += itemTaxAmount;

      return {
        ...item,
        total: parseFloat(itemTotal.toFixed(2)),
      };
    }) || [];

    // Apply global discount to subtotal (if any)
    const globalDiscountAmount = dto.globalDiscount || 0;
    totalDiscount += globalDiscountAmount;

    // Apply global tax rate to subtotal (if specified)
    // This is in addition to item-level taxes
    const globalTaxAmount = dto.globalTaxRate 
      ? (subtotal - globalDiscountAmount) * dto.globalTaxRate 
      : 0;
    totalTax += globalTaxAmount;

    // Calculate grand total
    // Formula: Subtotal - Total Discounts + Total VAT
    const grandTotal = subtotal - totalDiscount + totalTax;

    // Return invoice data with calculated fields
    return {
      ...dto,
      items: calculatedItems,
      subtotal: parseFloat(subtotal.toFixed(2)),
      totalTax: parseFloat(totalTax.toFixed(2)),
      totalDiscount: parseFloat(totalDiscount.toFixed(2)),
      total: parseFloat(grandTotal.toFixed(2)),
      currency: dto.currency || 'RWF', // Default to Rwandan Franc
    };
  }

  /**
   * Validate invoice business rules
   */
  private validateInvoice(dto: CreateInvoiceDto | UpdateInvoiceDto): void {
    // Validate that due date is after invoice date
    if (dto.dueDate && dto.invoiceDate) {
      const invoiceDate = new Date(dto.invoiceDate);
      const dueDate = new Date(dto.dueDate);
      
      if (dueDate < invoiceDate) {
        throw new BadRequestException('Due date must be after or equal to invoice date');
      }
    }

    // Validate that invoice has at least one item
    if (dto.items && dto.items.length === 0) {
      throw new BadRequestException('Invoice must have at least one item');
    }

    // Validate item quantities and prices
    if (dto.items) {
      dto.items.forEach((item, index) => {
        if (item.quantity <= 0) {
          throw new BadRequestException(`Item ${index + 1}: Quantity must be greater than 0`);
        }
        if (item.unitPrice < 0) {
          throw new BadRequestException(`Item ${index + 1}: Unit price cannot be negative`);
        }
      });
    }

    // Validate TIN numbers format (Rwanda TIN is 9 or 10 digits)
    if (dto.from?.TinNumber && !/^\d{9,10}$/.test(dto.from.TinNumber)) {
      throw new BadRequestException('Seller TIN number must be 9 or 10 digits');
    }
    if (dto.to?.TinNumber && !/^\d{9,10}$/.test(dto.to.TinNumber)) {
      throw new BadRequestException('Buyer TIN number must be 9 or 10 digits');
    }
  }

  /**
   * Create a new invoice with Rwanda-specific calculations
   */
  async create(createInvoiceDto: CreateInvoiceDto): Promise<Invoice> {
    // Validate invoice
    this.validateInvoice(createInvoiceDto);

    // Calculate totals with Rwanda VAT
    const calculatedDto = this.calculateInvoiceTotals(createInvoiceDto);

    // Set default status if not provided
    if (!calculatedDto.status) {
      calculatedDto.status = InvoiceStatus.DRAFT;
    }

    try {
      const createdInvoice = new this.invoiceModel(calculatedDto);
      return await createdInvoice.save();
    } catch (error: any) {
      if (error.code === 11000) {
        throw new ConflictException(
          `Invoice number ${createInvoiceDto.invoiceNumber} already exists`,
        );
      }
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Find all invoices with optional filters
   */
  async findAll(filters?: {
    status?: InvoiceStatus;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    skip?: number;
  }): Promise<Invoice[]> {
    const query: any = {};

    // Filter by status
    if (filters?.status) {
      query.status = filters.status;
    }

    // Filter by invoice date range
    if (filters?.fromDate || filters?.toDate) {
      query.invoiceDate = {};
      if (filters.fromDate) {
        query.invoiceDate.$gte = filters.fromDate;
      }
      if (filters.toDate) {
        query.invoiceDate.$lte = filters.toDate;
      }
    }

    return this.invoiceModel
      .find(query)
      .limit(filters?.limit || 100)
      .skip(filters?.skip || 0)
      .sort({ createdAt: -1 }) // Most recent first
      .exec();
  }

  /**
   * Find one invoice by MongoDB ID
   */
  async findOne(id: string): Promise<Invoice> {
    const invoice = await this.invoiceModel.findById(id).exec();
    
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }
    
    return invoice;
  }

  /**
   * Find invoice by unique invoice number
   */
  async findByInvoiceNumber(invoiceNumber: string): Promise<Invoice> {
    const invoice = await this.invoiceModel.findOne({ invoiceNumber }).exec();
    
    if (!invoice) {
      throw new NotFoundException(
        `Invoice with number ${invoiceNumber} not found`,
      );
    }
    
    return invoice;
  }

  /**
   * Update an existing invoice with recalculations
   */
  async update(id: string, updateInvoiceDto: UpdateInvoiceDto): Promise<Invoice> {
    // Check if invoice exists
    const existingInvoice = await this.findOne(id);

    // Don't allow updates to PAID or CANCELLED invoices
    if (existingInvoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot update a paid invoice');
    }
    if (existingInvoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled invoice');
    }

    // Validate the update data
    this.validateInvoice(updateInvoiceDto);

    // Recalculate totals if items are being updated
    const updateData = updateInvoiceDto.items
      ? this.calculateInvoiceTotals(updateInvoiceDto)
      : updateInvoiceDto;

    try {
      const updatedInvoice = await this.invoiceModel
        .findByIdAndUpdate(id, updateData, { new: true, runValidators: true })
        .exec();

      if (!updatedInvoice) {
        throw new NotFoundException(`Invoice with ID ${id} not found`);
      }

      return updatedInvoice;
    } catch (error: any) {
      if (error.code === 11000) {
        throw new ConflictException('Invoice number already exists');
      }
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Update invoice status only
   * Common status transitions in Rwanda:
   * DRAFT -> SENT -> PAID
   * DRAFT -> CANCELLED
   * SENT -> OVERDUE (automatically based on due date)
   */
  async updateStatus(id: string, status: InvoiceStatus): Promise<Invoice> {
    const invoice = await this.findOne(id);

    // Validate status transitions
    if (invoice.status === InvoiceStatus.PAID && status !== InvoiceStatus.PAID) {
      throw new BadRequestException('Cannot change status of a paid invoice');
    }

    if (invoice.status === InvoiceStatus.CANCELLED && status !== InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot change status of a cancelled invoice');
    }

    const updatedInvoice = await this.invoiceModel
      .findByIdAndUpdate(id, { status }, { new: true })
      .exec();

    if (!updatedInvoice) {
      throw new NotFoundException(`Invoice with ID ${id} not found`);
    }

    return updatedInvoice;
  }

  /**
   * Delete an invoice (only DRAFT invoices can be deleted)
   */
  async remove(id: string): Promise<void> {
    const invoice = await this.findOne(id);

    // Only allow deletion of draft invoices
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot delete invoice with status ${invoice.status}. Only DRAFT invoices can be deleted.`,
      );
    }

    await this.invoiceModel.findByIdAndDelete(id).exec();
  }

  /**
   * Get invoice statistics (useful for dashboard)
   */
  async getStatistics(): Promise<any> {
    const stats = await this.invoiceModel.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$total' },
        },
      },
    ]);

    return stats;
  }

  /**
   * Check for overdue invoices and update their status
   */
  async updateOverdueInvoices(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];

    const result = await this.invoiceModel.updateMany(
      {
        status: InvoiceStatus.SENT,
        dueDate: { $lt: today },
      },
      {
        $set: { status: InvoiceStatus.OVERDUE },
      },
    );

    return result.modifiedCount;
  }

  /**
   * Generate PDF for an invoice (Rwanda-specific format)
   */
  async generatePDF(id: string, res: Response): Promise<void> {
    const invoice = await this.findOne(id);

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`,
    );

    // Pipe PDF to response
    doc.pipe(res);

    // PDF Header - Company Logo Area
    doc.fontSize(20).text('INVOICE', { align: 'center' });
    doc.moveDown();

    // Invoice Details Box (Top Right)
    const rightColumnX = 350;
    doc.fontSize(10);
    doc.text(`Invoice Number: ${invoice.invoiceNumber}`, rightColumnX, 100);
    doc.text(`Invoice Date: ${invoice.invoiceDate}`, rightColumnX, 115);
    doc.text(`Due Date: ${invoice.dueDate}`, rightColumnX, 130);
    doc.text(`Status: ${(invoice.status || InvoiceStatus.DRAFT).toUpperCase()}`, rightColumnX, 145);
    doc.text(`Currency: ${invoice.currency || 'RWF'}`, rightColumnX, 160);

    // From (Seller) Section
    doc.fontSize(12).text('FROM:', 50, 100, { underline: true });
    doc.fontSize(10);
    doc.text(invoice.from.companyName, 50, 120);
    doc.text(`TIN: ${invoice.from.TinNumber}`, 50, 135);
    doc.text(`Phone: ${invoice.from.phone}`, 50, 150);
    if (invoice.from.email) {
      doc.text(`Email: ${invoice.from.email}`, 50, 165);
    }
    if (invoice.from.address) {
      const addr = invoice.from.address;
      let addressText = '';
      if (addr.street) addressText += addr.street + ', ';
      if (addr.city) addressText += addr.city + ', ';
      if (addr.country) addressText += addr.country;
      if (addressText) doc.text(addressText, 50, 180);
    }

    // To (Buyer) Section
    doc.fontSize(12).text('TO:', 50, 220, { underline: true });
    doc.fontSize(10);
    doc.text(invoice.to.companyName, 50, 240);
    doc.text(`TIN: ${invoice.to.TinNumber}`, 50, 255);
    doc.text(`Phone: ${invoice.to.phone}`, 50, 270);
    if (invoice.to.email) {
      doc.text(`Email: ${invoice.to.email}`, 50, 285);
    }

    // Items Table
    const tableTop = 330;
    doc.fontSize(12).text('ITEMS', 50, tableTop, { underline: true });
    doc.moveDown();

    // Table Headers
    const itemsTableTop = tableTop + 25;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Description', 50, itemsTableTop);
    doc.text('Qty', 280, itemsTableTop, { width: 40, align: 'right' });
    doc.text('Unit Price', 330, itemsTableTop, { width: 60, align: 'right' });
    doc.text('Discount', 400, itemsTableTop, { width: 50, align: 'right' });
    doc.text('Tax Rate', 460, itemsTableTop, { width: 50, align: 'right' });
    doc.text('Total', 520, itemsTableTop, { width: 60, align: 'right' });

    // Draw line under headers
    doc.moveTo(50, itemsTableTop + 15).lineTo(580, itemsTableTop + 15).stroke();

    // Table Rows
    doc.font('Helvetica');
    let yPosition = itemsTableTop + 25;

    invoice.items.forEach((item) => {
      // Check if we need a new page
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }

      doc.fontSize(9);
      doc.text(item.description, 50, yPosition, { width: 220 });
      doc.text(item.quantity.toString(), 280, yPosition, { width: 40, align: 'right' });
      doc.text(this.formatCurrency(item.unitPrice), 330, yPosition, { width: 60, align: 'right' });
      doc.text(this.formatCurrency(item.discount || 0), 400, yPosition, { width: 50, align: 'right' });
      doc.text(`${((item.taxRate || this.RWANDA_VAT_RATE) * 100).toFixed(0)}%`, 460, yPosition, { width: 50, align: 'right' });
      doc.text(this.formatCurrency(item.total || 0), 520, yPosition, { width: 60, align: 'right' });

      yPosition += 25;
    });

    // Draw line before totals
    yPosition += 10;
    doc.moveTo(50, yPosition).lineTo(580, yPosition).stroke();
    yPosition += 15;

    // Totals Section
    doc.font('Helvetica-Bold').fontSize(10);

    const totalsX = 420;
    doc.text('Subtotal:', totalsX, yPosition);
    doc.text(this.formatCurrency(invoice.subtotal || 0), 520, yPosition, { width: 60, align: 'right' });
    yPosition += 20;

    if (invoice.globalDiscount) {
      doc.text('Global Discount:', totalsX, yPosition);
      doc.text(this.formatCurrency(invoice.globalDiscount), 520, yPosition, { width: 60, align: 'right' });
      yPosition += 20;
    }

    if (invoice.totalDiscount) {
      doc.text('Total Discount:', totalsX, yPosition);
      doc.text(this.formatCurrency(invoice.totalDiscount), 520, yPosition, { width: 60, align: 'right' });
      yPosition += 20;
    }

    doc.text('Total Tax (VAT):', totalsX, yPosition);
    doc.text(this.formatCurrency(invoice.totalTax || 0), 520, yPosition, { width: 60, align: 'right' });
    yPosition += 25;

    // Grand Total
    doc.fontSize(12);
    doc.text('TOTAL:', totalsX, yPosition);
    doc.text(this.formatCurrency(invoice.total || 0) + ' ' + (invoice.currency || 'RWF'), 520, yPosition, { width: 60, align: 'right' });

    // Notes Section (if any)
    if (invoice.notes) {
      yPosition += 40;
      if (yPosition > 700) {
        doc.addPage();
        yPosition = 50;
      }
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Notes:', 50, yPosition);
      doc.font('Helvetica').fontSize(9);
      doc.text(invoice.notes, 50, yPosition + 15, { width: 500 });
    }

    // Footer
    const footerY = 600;
    doc.fontSize(8).font('Helvetica');
    doc.text(`Approved by: ${invoice.from.companyName}`, 50, footerY, { align: 'center' });
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 50, footerY + 12, { align: 'center' });

    // Finalize PDF
    doc.end();
  }

  /**
   * Helper method to format currency
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-RW', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  }
}
