"""MITRIXO product brochure. All product illustrations are original vector schematics.

Build with the bundled Python runtime. No customer data or credentials are used.
Fonts: installed Montserrat and Open Sans. Output: output/pdf/.
"""
from pathlib import Path
from html import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.utils import ImageReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/MITRIXO_BRAVO_DELTA_BROCHURE.pdf'
SCREENS = ROOT / 'docs/brochure_live_screens'
OUT.parent.mkdir(parents=True, exist_ok=True)
for name, file in [('Head','Montserrat-Bold.ttf'),('Heavy','Montserrat-ExtraBold.ttf'),('Light','Montserrat-Light.ttf'),('Body','OpenSans-Regular.ttf'),('BodyBold','OpenSans-Bold.ttf')]:
    pdfmetrics.registerFont(TTFont(name, str(Path('C:/Windows/Fonts') / file)))

W,H=595.28,841.89
M=43
C=canvas.Canvas(str(OUT),pagesize=(W,H),pageCompression=1)
C.setTitle('MITRIXO | Bravo and Delta | White Label Gym Management Software')
C.setAuthor('Michael Mitry | MITRIXO')
C.setSubject('Bravo for boxing clubs and Delta for multi-service fitness centres')
BLACK='#101112'; INK='#18191B'; GREY='#676A6D'; LIGHT='#D5D7D9'; WHITE='#FFFFFF'; PAPER='#F4F4F2'
page=0

def rect(x,y,w,h,fill,stroke=None,r=0):
    C.setFillColor(HexColor(fill));C.setStrokeColor(HexColor(stroke or fill))
    if r:C.roundRect(x,H-y-h,w,h,r,fill=1,stroke=bool(stroke))
    else:C.rect(x,H-y-h,w,h,fill=1,stroke=bool(stroke))

def line(x,y,x2,y2,color=LIGHT,width=.7):
    C.setStrokeColor(HexColor(color));C.setLineWidth(width);C.line(x,H-y,x2,H-y2)

def txt(s,x,y,size=11,font='Body',color=INK):
    C.setFillColor(HexColor(color));C.setFont(font,size);C.drawString(x,H-y-size,s)

def label(s,x,y,color=GREY,size=8):
    C.saveState()
    t=C.beginText(x,H-y-size);t.setFont('Head',size);t.setFillColor(HexColor(color));t.setCharSpace(1.7);t.textOut(s.upper());C.drawText(t)
    C.restoreState()

def para(s,x,y,w,size=11,color=INK,leading=None,font='Body'):
    style=ParagraphStyle('p',fontName=font,fontSize=size,leading=leading or size*1.55,textColor=HexColor(color),spaceAfter=0)
    p=Paragraph(s,style);_,h=p.wrap(w,800)
    assert y+h < H-35, (page,s[:60],y+h)
    p.drawOn(C,x,H-y-h);return y+h

def heading(lines,x,y,size=36,color=INK):
    for i,s in enumerate(lines):txt(s,x,y+i*size*1.09,size,'Heavy',color)
    return y+len(lines)*size*1.09

def start(section,dark=False):
    global page
    page+=1
    rect(0,0,W,H,BLACK if dark else WHITE)
    label('MITRIXO',M,29,WHITE if dark else INK,10)
    label(section,310,31,'#A4A6A8' if dark else GREY,7)
    label('BRAVO / DELTA',M,H-32,'#A4A6A8' if dark else GREY,7)
    txt(f'{page:02d}',W-M-16,H-35,10,'Head',WHITE if dark else INK)

def end():C.showPage()

def feature(n,title,body,x,y,w=236,dark=False):
    label(n,x,y,'#A4A6A8' if dark else GREY,8)
    txt(title,x,y+24,14,'Head',WHITE if dark else INK)
    return para(body,x,y+50,w,10.5,'#D2D3D5' if dark else GREY)

def arrow(x,y,x2,color=GREY):
    line(x,y,x2,y,color,1)
    line(x2-5,y-3,x2,y,color,1);line(x2-5,y+3,x2,y,color,1)

def edition_glyph(kind,x,y,scale=1,color=WHITE):
    C.saveState();C.translate(x,H-y);C.scale(scale,scale);C.setStrokeColor(HexColor(color));C.setLineWidth(2)
    if kind=='bravo':
        # Ring plan: a graphic identity, not a product screen.
        for inset in [0,13,26]:C.rect(inset,-(150-inset),150-2*inset,150-2*inset,fill=0,stroke=1)
        for a,b in [(0,0),(150,0),(0,-150),(150,-150)]:C.circle(a,b,4,fill=0,stroke=1)
    else:
        for inset in [0,17,34]:
            p=C.beginPath();p.moveTo(75,-inset);p.lineTo(150-inset,-150+inset);p.lineTo(inset,-150+inset);p.close();C.drawPath(p)
    C.restoreState()

def screenshot(path,x,y,w,h,dark=False):
    """Place a real product capture inside a restrained browser frame."""
    rect(x,y,w,h,'#222426' if dark else '#E7E8E8',r=9)
    rect(x+1.5,y+1.5,w-3,h-3,'#0D0E0F' if dark else WHITE,r=8)
    dot='#797C80' if dark else '#A9ACAF'
    for i in range(3):
        C.setFillColor(HexColor(dot));C.circle(x+14+i*10,H-y-14,2.2,fill=1,stroke=0)
    line(x+1.5,y+26,x+w-1.5,y+26,'#343638' if dark else LIGHT,.6)
    im=ImageReader(str(path));iw,ih=im.getSize()
    avail_w,avail_h=w-12,h-38
    scale=max(avail_w/iw,avail_h/ih)
    sw,sh=iw*scale,ih*scale
    C.saveState();p=C.beginPath();p.rect(x+6,H-y-h+6,avail_w,avail_h);C.clipPath(p,stroke=0,fill=0)
    C.drawImage(im,x+6+(avail_w-sw)/2,H-y-h+6+(avail_h-sh)/2,width=sw,height=sh,mask='auto')
    C.restoreState()

# 01 - Product cover, not a generic capability report.
start('GYM MANAGEMENT SOFTWARE',True)
label('White label platform',M,109,'#C8CACC')
heading(['GYM SOFTWARE','UNDER YOUR','OWN BRAND'],M,146,43,WHITE)
para('Connect your memberships, bookings, payments and team in one branded platform.',M,312,425,15,'#CFD1D3',22)
line(M,398,W-M,398,'#3B3D40')
edition_glyph('bravo',M+5,443,.59,'#BFC1C3')
edition_glyph('delta',M+276,443,.59,'#BFC1C3')
txt('BRAVO',M,562,32,'Heavy',WHITE)
txt('DELTA',M+271,562,32,'Heavy',WHITE)
para('For boxing clubs and<br/>combat-sports gyms.',M,610,223,12,'#CFD1D3')
para('For fitness clubs and<br/>multi-service training centres.',M+271,610,223,12,'#CFD1D3')
label('Strike Boxing configuration',M,684,'#A4A6A8',7)
label('Inzan Athletics configuration',M+271,684,'#A4A6A8',6.8)
txt('mitrixo.com',M,748,12,'Head',WHITE)
C.linkURL('https://mitrixo.com',(M,H-767,M+120,H-746),relative=0)
end()

# 02 - State clearly what is sold; explain the connected product.
start('THE PLATFORM')
label('What is Mitrixo',M,97)
heading(['YOUR GYM BUSINESS','IN ONE SYSTEM'],M,129,32)
para('MITRIXO is white-label gym management software. It connects your sales process and daily operations with a member experience carrying your gym’s identity.',M,226,493,12.5)
para('Staff can follow the member journey without rebuilding the same information in a separate tool for each department.',M,297,485,11,GREY)
label('A connected member journey',M,371)
steps=[('01','ENQUIRY','Lead and follow-up'),('02','MEMBERSHIP','Package and payment'),('03','BOOKING','Class or PT session'),('04','VISIT','Check-in and history')]
for i,(num,title,sub) in enumerate(steps):
    x=M+i*132
    txt(num,x,409,31,'Light','#A0A3A6');txt(title,x,459,9,'Head')
    para(sub,x,482,115,9.5,GREY)
    if i<3:arrow(x+47,435,x+111,'#A0A3A6')
line(M,552,W-M,552)
feature('FOR YOUR MEMBERS','A branded place to book','Membership details, digital pass, upcoming bookings and service history.',M,578)
feature('FOR YOUR TEAM','A shared operating view','Member records, schedules, collections and follow-up, organised by role.',315,578)
para('Bravo and Delta share the platform foundation. Each edition emphasises a different way of running a gym.',M,733,480,10,GREY)
end()

# 03 - Bravo positioning with a live Strike product view.
start('BRAVO / BOXING AND COMBAT SPORTS',True)
label('Edition 01',M,91,'#B9BCBF')
heading(['BRAVO'],M,119,57,WHITE)
para('Built around the training schedule.',M,194,455,18,WHITE,25,'Head')
para('For boxing clubs and combat-sports gyms where class capacity, coaching and attendance shape the working day.',M,242,475,11,'#D2D3D5')
screenshot(SCREENS/'strike-class-manager-desktop.jpg',M,321,W-2*M,286,True)
label('Live Strike configuration / class schedule manager',M,622,'#B9BCBF',7)
feature('01 / SCHEDULE','Run the timetable','Publish classes, assign coaches, set capacity and review the active roster.',M,658,218,True)
feature('02 / OPERATIONS','Keep the day visible','Connect programmes, branches, attendance and staff actions in one working view.',315,658,218,True)
end()

# 04 - Delta positioning with a live Inzan product view.
start('DELTA / MULTI SERVICE FITNESS')
label('Edition 02',M,91)
heading(['DELTA'],M,119,57)
para('Connect the whole club.',M,194,455,19,INK,26,'Head')
para('For fitness clubs and performance centres coordinating memberships, PT, classes and nutrition through several teams.',M,242,475,11,GREY)
screenshot(SCREENS/'inzan-class-manager-desktop.jpg',M,321,W-2*M,286,False)
label('Live Inzan configuration / class schedule manager',M,622,GREY,7)
feature('01 / SERVICES','Coordinate more services','Connect the member journey with schedules, staff workspaces and operational requests.',M,658,218)
feature('02 / CONTROL','See the working picture','Give each role the tools it needs while management retains broader oversight.',315,658,218)
end()

# 05 - Responsive product proof using a live mobile view.
start('THE MEMBER EXPERIENCE')
label('Responsive by design',M,91)
heading(['DESKTOP CONTROL','MOBILE ACCESS'],M,123,32)
para('The same live platform adapts to the smaller screen, keeping navigation and daily actions available away from the desk.',M,215,486,11.5,GREY)
rect(M,291,230,392,'#111214',r=25)
rect(M+8,299,214,376,'#060707',r=19)
C.drawImage(ImageReader(str(SCREENS/'inzan-class-manager-mobile.jpg')),M+17,H-661,width=196,height=349,preserveAspectRatio=True,anchor='c',mask='auto')
rect(M+87,304,56,6,'#292B2D',r=3)
label('Live mobile / 390 px',M,699,GREY,6)
feature('RESPONSIVE NAVIGATION','Work beyond the desk','The live Inzan configuration condenses its navigation and operational cards for mobile use.',315,330,220)
feature('ONE PLATFORM','Keep the context','Staff can move between desktop and mobile layouts without changing systems or rebuilding records.',315,506,220)
para('Screenshot captured from the live Inzan staff interface. Mobile appearance varies by device and enabled modules.',315,678,220,8.5,GREY)
end()

# 06 - A readable capability spread, no invented KPIs.
start('BUSINESS OPERATIONS')
label('Behind every member experience',M,97)
heading(['GIVE YOUR TEAM','THE WORKING TOOLS'],M,129,32)
para('Keep the routine work visible, with the records managers need to review it.',M,227,475,12,GREY)
items=[
('01','Sales and follow-up','Keep enquiries, member records, call outcomes and next actions connected.'),
('02','Payments and balances','Record collections and payment methods, review outstanding amounts and retain transaction history.'),
('03','Bookings and attendance','Coordinate the schedule and distinguish reservations from completed visits.'),
('04','Roles and approvals','Organise access around staff responsibilities and route controlled changes for review.'),
('05','Reports and exports','Review activity and collections by the available filters, then export for further analysis.'),
('06','Club services','Add configured workflows for nutrition, lockers, guests, orders and member complaints.')]
for i,(n,title,body) in enumerate(items):feature(n,title,body,M+(i%2)*272,307+(i//2)*148)
para('Available modules and permissions are agreed for each installation. Selected club services depend on the chosen configuration.',M,763,490,8.5,GREY)
end()

# 07 - Compare the positioning without inventing a licence feature matrix.
start('CHOOSE YOUR EDITION')
label('Choose by operating model',M,97)
heading(['BRAVO OR DELTA'],M,129,36)
para('Start with how your club operates. Then configure the platform around your services and brand.',M,194,490,12,GREY)
xs=[M,188,368];widths=[145,180,184];y=274
rect(M,y,W-2*M,49,INK)
for x,s in zip(xs,['EDITION FOCUS','BRAVO','DELTA']):txt(s,x+12,y+17,10,'Head',WHITE)
rows=[
('Best fit','Boxing clubs and combat-sports gyms','Fitness clubs and multi-service centres'),
('Daily emphasis','Class timetable, packages, coaches and check-in','Memberships, PT, classes and nutrition'),
('Team structure','Reception, coaches and club management','Front desk, sales, coaches, nutrition and management'),
('Configuration reference','Strike Boxing','Inzan Athletics'),
('Shared foundation','Members, payments, bookings, staff workflows and reporting','Members, payments, bookings, staff workflows and reporting'),
('White label identity','Your logo, colours and configured domain','Your logo, colours and configured domain')]
y+=49
for i,row in enumerate(rows):
    rh=66 if i!=4 else 81
    rect(M,y,W-2*M,rh,PAPER if i%2==0 else WHITE)
    for x,w,s in zip(xs,widths,row):para(escape(s),x+12,y+13,w-24,9.5,INK,14,'BodyBold' if x==M else 'Body')
    line(M,y+rh,W-M,y+rh,LIGHT)
    y+=rh
for x in [M,188,368,W-M]:line(x,274,x,y,LIGHT)
para('These are edition specialisations, not a claim that every capability is exclusive to one edition. The final module scope is agreed in your proposal.',M,752,490,9,GREY)
end()

# 08 - Commercial next step and honest boundaries.
start('YOUR BRAND / YOUR CONFIGURATION',True)
label('White label by design',M,97,'#B9BCBF')
heading(['LET MEMBERS','SEE YOUR BRAND'],M,130,37,WHITE)
para('Keep your gym’s identity at the centre of the experience. Configure the platform with your logo, colours, products, staff roles and domain.',M,232,480,13,'#D2D3D5',20)
line(M,326,W-M,326,'#3B3D40')
for i,(title,body) in enumerate([
('Choose your edition','Start with Bravo or Delta and define the workflows your club needs.'),
('Shape your configuration','Review branding, member data, products, staff access and integration requirements.'),
('Validate your launch','Demonstrate your key journeys and agree acceptance checks before go-live.')]):
    yy=354+i*88
    txt(f'0{i+1}',M,yy,24,'Light','#A4A6A8');txt(title,98,yy,14,'Head',WHITE)
    para(body,98,yy+28,441,10.5,'#C8CACC')
txt('REQUEST A PRODUCT DEMO',M,642,21,'Heavy',WHITE)
txt('Michael Mitry',M,689,13,'Head',WHITE)
txt('mitrixo.com',M,716,12,'Body',WHITE);txt('mi5a.com',220,716,12,'Body',WHITE)
C.linkURL('https://mitrixo.com',(M,H-734,M+105,H-714),relative=0)
C.linkURL('https://mi5a.com',(220,H-734,310,H-714),relative=0)
para('Scope, pricing and launch acceptance are agreed per project. Online payment gateways, external SMS/WhatsApp and access-control hardware require separate integration and configuration.',M,754,495,8,'#A4A6A8',11)
end()
C.save()
print(OUT)
print(f'{page} pages')
