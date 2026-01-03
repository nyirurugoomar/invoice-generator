import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { InvoiceService } from './invoice.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { InvoiceStatus } from './schemas/invoice.schema';

@Controller('invoice')
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(ValidationPipe) createInvoiceDto: CreateInvoiceDto) {
    return this.invoiceService.create(createInvoiceDto);
  }

  
  @Get()
  findAll(
    @Query('status') status?: InvoiceStatus,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('limit') limit?: string,
    @Query('skip') skip?: string,
  ) {
    return this.invoiceService.findAll({
      status,
      fromDate,
      toDate,
      limit: limit ? parseInt(limit, 10) : undefined,
      skip: skip ? parseInt(skip, 10) : undefined,
    });
  }


  @Get('statistics')
  getStatistics() {
    return this.invoiceService.getStatistics();
  }

  
  @Patch('update-overdue')
  updateOverdueInvoices() {
    return this.invoiceService.updateOverdueInvoices();
  }


  @Get('number/:invoiceNumber')
  findByInvoiceNumber(@Param('invoiceNumber') invoiceNumber: string) {
    return this.invoiceService.findByInvoiceNumber(invoiceNumber);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.invoiceService.findOne(id);
  }


  @Get(':id/pdf')
  async downloadPDF(@Param('id') id: string, @Res() res: Response) {
    return this.invoiceService.generatePDF(id, res);
  }

 
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateInvoiceDto: UpdateInvoiceDto,
  ) {
    return this.invoiceService.update(id, updateInvoiceDto);
  }

  

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: InvoiceStatus,
  ) {
    return this.invoiceService.updateStatus(id, status);
  }


  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.invoiceService.remove(id);
  }
}
