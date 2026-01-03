import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InvoiceDocument = Invoice & Document;

// Enums
export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
}


@Schema({ _id: false })
export class Address {
  @Prop() street?: string;
  @Prop() city?: string;
  @Prop() state?: string;
  @Prop() postalCode?: string;
  @Prop() country?: string;
}

export const AddressSchema = SchemaFactory.createForClass(Address);

@Schema({ _id: false })
export class CompanyInfo {
  @Prop({ required: true }) companyName: string;
  @Prop() email?: string;
  @Prop({required:true}) phone: string;
  @Prop({required:true}) TinNumber: string;
  @Prop({ type: AddressSchema }) address?: Address;
  @Prop() logoUrl?: string;
}

export const CompanyInfoSchema = SchemaFactory.createForClass(CompanyInfo);

@Schema({ _id: false })
export class InvoiceItem {
  @Prop() id?: string;
  @Prop({ required: true }) description: string;
  @Prop({ required: true }) quantity: number;
  @Prop({ required: true }) unitPrice: number;
  @Prop() taxRate?: number;
  @Prop() discount?: number;
  @Prop() total?: number;
}

export const InvoiceItemSchema = SchemaFactory.createForClass(InvoiceItem);

@Schema({ timestamps: true })
export class Invoice {
  @Prop({ required: true, unique: true }) invoiceNumber: string;
  @Prop({ required: true }) invoiceDate: string;
  @Prop({ required: true }) dueDate: string;
  @Prop({ type: CompanyInfoSchema, required: true }) from: CompanyInfo;
  @Prop({ type: CompanyInfoSchema, required: true }) to: CompanyInfo;
  @Prop({ type: [InvoiceItemSchema], required: true }) items: InvoiceItem[];
  @Prop() currency?: string;
  @Prop() notes?: string;
  @Prop() globalTaxRate?: number;
  @Prop() globalDiscount?: number;
  @Prop() subtotal?: number;
  @Prop() totalTax?: number;
  @Prop() totalDiscount?: number;
  @Prop() total?: number;
  @Prop({ enum: InvoiceStatus, default: InvoiceStatus.DRAFT }) status?: InvoiceStatus;
}

export const InvoiceSchema = SchemaFactory.createForClass(Invoice);



@Schema({ _id: false })
export class PaymentInfo {
  @Prop() bankName?: string;
  @Prop() accountNumber?: string;
  @Prop() swiftCode?: string;
  @Prop() iban?: string;
  @Prop() paymentTerms?: string;
}

export const PaymentInfoSchema = SchemaFactory.createForClass(PaymentInfo);
