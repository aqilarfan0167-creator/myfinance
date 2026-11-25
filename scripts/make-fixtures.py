"""Generates synthetic receipt fixtures (PNG, noisy/rotated JPG, scanned PDF, text PDF) for OCR tests."""
import random, sys, zlib
from PIL import Image, ImageDraw, ImageFont, ImageFilter
out = sys.argv[1]
mono = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 26)
bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 28)
def render(lines, w=760):
    h = 60 + 40 * len(lines)
    im = Image.new('L', (w, h), 255); d = ImageDraw.Draw(im)
    for i, l in enumerate(lines):
        f = bold if i == 0 or l.startswith('TOTAL') or l.startswith('JUMLAH') else mono
        d.text((30, 30 + i * 40), l, fill=0, font=f)
    return im
resto = ["RESTORAN NASI KANDAR PELITA SDN BHD", "(123456-X)", "No. 12, Jalan Ampang,", "50450 Kuala Lumpur", "TAX INVOICE",
         "Invoice No: INV-0045821", "Date: 23/11/2026  Time: 08:45 PM", "Nasi Kandar Ayam  2 x 9.50   19.00", "Teh Tarik         2 x 2.80    5.60",
         "Roti Canai                    1.80", "Sub Total                    26.40", "Service Charge 10%            2.64", "SST 6%                        1.58",
         "Rounding Adj                 -0.02", "TOTAL                  RM    30.60", "VISA                         30.60", "Thank you! Please come again"]
bm = ["99 SPEED MART S/B", "LOT 5, TAMAN MELATI", "53100 KUALA LUMPUR", "NO. RESIT : 1012-334455", "TARIKH: 05-11-2026 MASA: 14:22",
      "MILO 1KG                12.90", "GARDENIA ROTI            3.20", "TELUR GRED A 30         16.50", "JUMLAH                  32.60",
      "TUNAI                   50.00", "BAKI                    17.40", "TERIMA KASIH"]
a = render(resto); a.save(f'{out}/receipt-restaurant.png')
b = render(bm, 620)
# phone-photo style: slight rotation, blur, noise, grey background, JPEG
n = b.rotate(2.5, expand=True, fillcolor=235).filter(ImageFilter.GaussianBlur(0.8))
px = n.load(); random.seed(1)
for _ in range(n.size[0] * n.size[1] // 40):
    x, y = random.randrange(n.size[0]), random.randrange(n.size[1]); px[x, y] = random.choice([0, 200, 255])
n.convert('RGB').save(f'{out}/receipt-bm-photo.jpg', quality=70)
# image-only (scanned) PDF
a.convert('RGB').save(f'{out}/receipt-scanned.pdf', resolution=150)
# text PDF (embedded text, no image) – minimal hand-written PDF
pdf_lines = ["SHELL MALAYSIA TRADING SDN BHD", "Shell Jalan Kuching", "Invoice No: SH-778812", "Date: 18/11/2026 10:05", "FuelSave 95  30.12 L  60.24", "TOTAL RM 60.24", "Payment: MASTERCARD"]
content = "BT /F1 12 Tf 50 780 Td 16 TL " + " ".join(f"({l}) Tj T*" for l in pdf_lines) + " ET"
objs = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
pdf = "%PDF-1.4\n"; offs = []
for i, o in enumerate(objs, 1): offs.append(len(pdf)); pdf += f"{i} 0 obj\n{o}\nendobj\n"
x = len(pdf); pdf += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n" + "".join(f"{o:010d} 00000 n \n" for o in offs)
pdf += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF\n"
open(f'{out}/receipt-text.pdf', 'w').write(pdf)
print('fixtures written')
slip = ["SYARIKAT ABC SDN BHD", "PAYSLIP FOR THE MONTH OF OCTOBER 2026", "Employee: AHMAD BIN ALI", "BASIC SALARY          4,500.00",
        "TRAVEL ALLOWANCE        300.00", "OVERTIME                270.38", "GROSS PAY             5,070.38", "EPF (EMPLOYEE)          528.00",
        "EPF EMPLOYER            624.00", "SOCSO                    24.75", "EIS                       9.90", "PCB                     180.00",
        "TOTAL DEDUCTIONS        742.65", "NET PAY               4,327.73"]
render(slip).save(f'{out}/payslip.png')
print('payslip written')
