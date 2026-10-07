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

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output/pdf/MITRIXO_BRAVO_DELTA_BROCHURE.pdf'
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

# 03 - Bravo positioning. Do not claim other editions lack shared features.
start('BRAVO / BOXING AND COMBAT SPORTS',True)
label('Edition 01',M,97,'#B9BCBF')
heading(['BRAVO'],M,127,65,WHITE)
para('Built around the training schedule.',M,215,455,20,WHITE,27,'Head')
para('For boxing clubs, combat-sports gyms and coached studios where the timetable, member packages and attendance shape the working day.',M,271,350,12,'#D2D3D5')
edition_glyph('bravo',455,282,.54,'#8B8E91')
line(M,391,W-M,391,'#3B3D40')
feature('01 / MEMBERSHIPS','Know who can train','Manage member profiles, package validity, renewals and payment history in the same workflow.',M,419,dark=True)
feature('02 / CLASSES','Organise the timetable','Publish sessions, manage class capacity and review bookings and attendance.',315,419,dark=True)
feature('03 / COACHING','Keep sessions visible','Coordinate coaches and personal training, with session records connected to the member.',M,582,dark=True)
feature('04 / RECEPTION','Run the front desk','Search members, check them in, record collections and follow up on renewals.',315,582,dark=True)
label('Configuration reference / Strike Boxing',M,752,'#B9BCBF',7)
end()

# 04 - Delta positioning.
start('DELTA / MULTI SERVICE FITNESS')
label('Edition 02',M,97)
heading(['DELTA'],M,127,65)
para('Connect the whole club.',M,215,455,22,INK,29,'Head')
para('For fitness clubs and performance centres offering memberships, personal training, group classes and nutrition through several teams.',M,271,350,12,GREY)
edition_glyph('delta',455,282,.54,'#55585B')
line(M,391,W-M,391)
feature('01 / MEMBER JOURNEY','One member record','Connect lead follow-up, sales, packages and ongoing service history across departments.',M,419)
feature('02 / SERVICE DELIVERY','Coordinate more services','Bring PT, classes and nutrition appointments into connected member and staff workflows.',315,419)
feature('03 / CLUB CONTROL','Handle the exceptions','Review requests, approvals, member complaints and operational tasks with accountable staff roles.',M,582)
feature('04 / MANAGEMENT','See the operating picture','Review departmental activity, collections, outstanding balances and reports.',315,582)
label('Configuration reference / Inzan Athletics',M,752,GREY,7)
end()

# 05 - Product visual deliberately schematic, using no actual member data.
start('THE MEMBER EXPERIENCE')
label('Your brand in their hands',M,97)
heading(['MAKE THE NEXT','VISIT SIMPLE'],M,128,34)
para('Give members a familiar place to see their membership and plan their training.',M,226,269,12,GREY)
feature('MEMBERSHIP','A clearer account','Show package details, validity and remaining sessions where applicable.',M,320,255)
feature('BOOKINGS','A plan for the week','Browse services, book eligible sessions and review upcoming appointments.',M,459,255)
feature('ARRIVAL','A digital member pass','Bring the member’s identity into the check-in workflow with a QR pass.',M,598,255)
# Phone schematic, native vector text throughout.
px,py,pw,ph=344,247,205,452
rect(px,py,pw,ph,'#141517',r=24);rect(px+8,py+8,pw-16,ph-16,'#F5F5F3',r=18)
rect(px+70,py+16,65,8,'#141517',r=4)
label('YOUR CLUB',px+24,py+48,INK,9)
txt('Welcome back',px+24,py+82,16,'Head')
txt('Your membership',px+24,py+115,9,'Body',GREY)
line(px+24,py+141,px+pw-24,py+141)
txt('Member pass',px+24,py+160,12,'Head')
# Generic pass graphic: deliberately not a scannable QR credential.
for a,b in [(0,0),(37,0),(0,37)]:
    rect(px+28+a,py+193+b,23,23,INK);rect(px+32+a,py+197+b,15,15,'#F5F5F3');rect(px+36+a,py+201+b,7,7,INK)
txt('DEMO',px+111,py+207,11,'Head',GREY)
line(px+24,py+277,px+pw-24,py+277)
txt('Upcoming training',px+24,py+297,12,'Head')
txt('Group class',px+24,py+329,11,'Body')
txt('View booking',px+24,py+353,9,'Body',GREY)
rect(px+24,py+386,pw-48,34,INK,r=6);txt('EXPLORE CLASSES',px+39,py+395,8,'Head',WHITE)
para('Illustrative member journey.<br/>Not a live product screenshot.',344,717,205,8,GREY)
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
