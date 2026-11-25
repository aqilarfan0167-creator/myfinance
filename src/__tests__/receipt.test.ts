import { describe, it, expect } from 'vitest';
import { parseReceipt, parsePayslip, suggestCategory, toCents, amountsIn, normMerchant } from '@/domain/receipt';

const T = '2026-11-25';
const restaurant = `RESTORAN NASI KANDAR PELITA SDN BHD
(123456-X)
No. 12, Jalan Ampang,
50450 Kuala Lumpur
SST ID: W10-1808-31000123
TAX INVOICE
Invoice No: INV-0045821
Date: 23/11/2026   Time: 08:45 PM
Table: 12   Pax: 2
Nasi Kandar Ayam      2 x 9.50     19.00
Teh Tarik             2 x 2.80      5.60
Roti Canai                          1.80
Sub Total                          26.40
Service Charge 10%                  2.64
SST 6%                              1.58
Rounding Adj                       -0.02
TOTAL                    RM        30.60
VISA ************1234              30.60
Thank you! Please come again`;

const grocery = `99 SPEED MART S/B
LOT 5, TAMAN MELATI
53100 KUALA LUMPUR
RESIT
NO. RESIT : 1012-334455
TARIKH: 05-11-2026 MASA: 14:22
MILO 1KG                12.90
GARDENIA ROTI            3.20
TELUR GRED A 30          16.5O
JUMLAH                  32.60
TUNAI                   50.00
BAKI                    17.40
TERIMA KASIH`;

const petrol = `PETRONAS STESEN JLN DUTA
Petronas Dagangan Bhd
12 Nov 2026 07:31:02
RON95   20.15 L  @ 2.05   41.31
Grand Total RM 41.31
Payment: TNG eWallet`;

const noLabel = `KEDAI RUNCIT AH SENG
item A 4.00
item B 6.50
CASH 20.00`;

describe('amount parsing', () => {
  it('handles OCR noise and formats', () => {
    expect(toCents('12.50')).toBe(1250); expect(toCents('1,234.56')).toBe(123456); expect(toCents('16.5O')).toBe(1650);
    expect(toCents('RM 3,00')).toBe(300); expect(toCents('l2.30')).toBe(1230); expect(toCents('-0.02')).toBe(-2); expect(toCents('abc')).toBeNull();
    expect(amountsIn('Nasi 2 x 9.50 19.00')).toEqual([950, 1900]);
    expect(normMerchant('Petronas Dagangan Bhd (M)')).toBe('PETRONASDAGANGAN');
  });
});

describe('receipt parser', () => {
  it('restaurant with service charge, SST, rounding, card', () => {
    const r = parseReceipt(restaurant, T);
    expect(r.merchant.value).toBe('RESTORAN NASI KANDAR PELITA SDN BHD');
    expect(r.registrationNo.value).toBe('123456-X');
    expect(r.address.value).toBe('No. 12, Jalan Ampang, 50450 Kuala Lumpur');
    expect(r.date).toMatchObject({ value: '2026-11-23', confidence: 'high' });
    expect(r.time.value).toBe('20:45');
    expect(r.receiptNo.value).toBe('INV-0045821');
    expect(r.subtotal.value).toBe(2640); expect(r.serviceCharge.value).toBe(264); expect(r.sst.value).toBe(158); expect(r.rounding.value).toBe(-2);
    expect(r.total).toMatchObject({ value: 3060, confidence: 'high' });
    expect(r.paymentMethod.value).toBe('credit_card');
    expect(r.items.map((i) => [i.name, i.qty, i.unitPrice, i.amount])).toEqual([['Nasi Kandar Ayam', 2, 950, 1900], ['Teh Tarik', 2, 280, 560], ['Roti Canai', null, null, 180]]);
    expect(r.warnings).toEqual([]);
  });
  it('Bahasa Melayu grocery receipt with cash and change', () => {
    const r = parseReceipt(grocery, T);
    expect(r.merchant.value).toBe('99 SPEED MART S/B');
    expect(r.receiptNo.value).toBe('1012-334455');
    expect(r.date.value).toBe('2026-11-05'); expect(r.time.value).toBe('14:22');
    expect(r.total).toMatchObject({ value: 3260, confidence: 'high' });       // not the RM50 tendered
    expect(r.paymentMethod.value).toBe('cash');
    expect(r.items.map((i) => i.amount)).toEqual([1290, 320, 1650]);
  });
  it('petrol receipt with month name and e-wallet', () => {
    const r = parseReceipt(petrol, T);
    expect(r.date.value).toBe('2026-11-12'); expect(r.time.value).toBe('07:31');
    expect(r.total.value).toBe(4131); expect(r.paymentMethod.value).toBe('ewallet');
    expect(suggestCategory(r.merchant.value, petrol, {})?.categoryId).toBe('exp-petrol');
  });
  it('flags guesses instead of fabricating', () => {
    const r = parseReceipt(noLabel, T);
    expect(r.total).toMatchObject({ value: 650, confidence: 'low' });
    expect(r.date.value).toBeNull(); expect(r.receiptNo.value).toBeNull();
    expect(r.warnings.join(' ')).toMatch(/largest amount/);
    expect(r.warnings.join(' ')).toMatch(/Date not found/);
    const empty = parseReceipt('', T);
    expect(empty.total.value).toBeNull(); expect(empty.merchant.value).toBeNull();
  });
  it('rejects future dates and impossible dates', () => {
    expect(parseReceipt('SHOP\nDate: 31/02/2026\nTOTAL 5.00', T).date.value).toBeNull();
    const f = parseReceipt('SHOP\nDate: 01/01/2027\nTOTAL 5.00', T);
    expect(f.date.confidence).toBe('low');
  });
  it('categories: learned beats rules', () => {
    expect(suggestCategory('Restoran Nasi Kandar Pelita Sdn Bhd', '', {})?.categoryId).toBe('exp-food');
    expect(suggestCategory('Restoran Nasi Kandar Pelita Sdn Bhd', '', { 'restoran nasi kandar pelita sdn bhd': 'exp-family' })).toEqual({ categoryId: 'exp-family', source: 'learned' });
    expect(suggestCategory('Unknown Co', 'nothing here', {})).toBeNull();
  });
});

describe('payslip parser', () => {
  it('extracts earnings and statutory deductions, ignoring employer & YTD', () => {
    const p = parsePayslip(`SYARIKAT ABC SDN BHD
PAYSLIP FOR THE MONTH OF NOVEMBER 2026
BASIC SALARY        4,500.00
TRAVEL ALLOWANCE      300.00
OVERTIME              270.38
GROSS PAY           5,070.38
EPF (EMPLOYEE)        528.00
EPF EMPLOYER          624.00
SOCSO                  24.75
EIS                     9.90
PCB                   180.00
TOTAL DEDUCTIONS      742.65
NET PAY             4,327.73
YTD EPF             5,280.00`, T);
    expect(p.month.value).toBe('2026-11'); expect(p.company.value).toBe('SYARIKAT ABC SDN BHD');
    expect(p.basic.value).toBe(450000); expect(p.overtime.value).toBe(27038); expect(p.allowances).toEqual([{ name: 'TRAVEL ALLOWANCE', amount: 30000 }]);
    expect(p.epf.value).toBe(52800); expect(p.socso.value).toBe(2475); expect(p.eis.value).toBe(990); expect(p.pcb.value).toBe(18000);
    expect(p.gross.value).toBe(507038); expect(p.net.value).toBe(432773); expect(p.warnings).toEqual([]);
  });
});
