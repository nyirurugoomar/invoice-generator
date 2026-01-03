import { Expose, Type } from 'class-transformer';
import { InvoiceStatus } from '../schemas/invoice.schema';

class AddressResponse {
  @Expose()
  street?: string;

  @Expose()
  city?: string;

  @Expose()
  state?: string;

  @Expose()
  postalCode?: string;

  @Expose()
  country?: string;
}

class CompanyInfoResponse {
  @Expose()
  companyName: string;

  @Expose()
  email?: string;

  @Expose()
  phone: string;

  @Expose()
  TinNumber: string;

  @Expose()
  @Type(() => AddressResponse)
  address?: AddressResponse;

  @Expose()
  logoUrl?: string;
}

class InvoiceItemResponse {
  @Expose()
  id?: string;

  @Expose()
  description: string;

  @Expose()
  quantity: number;

  @Expose()
  unitPrice: number;

  @Expose()
  taxRate?: number;

  @Expose()
  discount?: number;

  @Expose()
  total?: number;
}

export class InvoiceResponseDto {
  @Expose()
  _id: string;

  @Expose()
  invoiceNumber: string;

  @Expose()
  invoiceDate: string;

  @Expose()
  dueDate: string;

  @Expose()
  @Type(() => CompanyInfoResponse)
  from: CompanyInfoResponse;

  @Expose()
  @Type(() => CompanyInfoResponse)
  to: CompanyInfoResponse;

  @Expose()
  @Type(() => InvoiceItemResponse)
  items: InvoiceItemResponse[];

  @Expose()
  currency?: string;

  @Expose()
  notes?: string;

  @Expose()
  globalTaxRate?: number;

  @Expose()
  globalDiscount?: number;

  @Expose()
  subtotal?: number;

  @Expose()
  totalTax?: number;

  @Expose()
  totalDiscount?: number;

  @Expose()
  total?: number;

  @Expose()
  status?: InvoiceStatus;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
