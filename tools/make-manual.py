"""Create the Japanese manual with an embedded CJK font. No user data is read."""
import argparse,json,re,shutil
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor,white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph,Table,TableStyle
from reportlab.lib.enums import TA_LEFT
ROOT=Path(__file__).resolve().parents[1]
FONT=Path('/System/Library/Fonts/Supplemental/Arial Unicode.ttf')
DATA=ROOT/'docs/manual-content-20261016.json'
OUT=ROOT/'output/pdf/omni-continue-user-guide-20261016.pdf'
W,H=595.2756,841.8898;L=48;R=48;CW=W-L-R;BOTTOM=49
INK=HexColor('#18352C');MUTED=HexColor('#596C64');GREEN=HexColor('#266B52');MINT=HexColor('#EFF6F1');LINE=HexColor('#D9E4DC');AMBER=HexColor('#FFF2DB');AMBERINK=HexColor('#77521D')
def main():
 p=argparse.ArgumentParser();p.add_argument('--font',default=str(FONT));p.add_argument('--output',default=str(OUT));a=p.parse_args()
 font=TTFont('JP',a.font);pdfmetrics.registerFont(font);pdfmetrics.registerFontFamily('JP',normal='JP',bold='JP',italic='JP',boldItalic='JP')
 data=json.loads(DATA.read_text());full=json.dumps(data,ensure_ascii=False);chars=set(re.sub(r'<[^>]+>','',full))
 missing=sorted(c for c in chars if ord(c)>32 and ord(c)not in font.face.charToGlyph)
 if missing:raise ValueError('Missing font glyphs: '+repr(missing))
 out=Path(a.output);out.parent.mkdir(parents=True,exist_ok=True)
 c=canvas.Canvas(str(out),pagesize=(W,H),pageCompression=1)
 c.setTitle(data['title']+' '+data['edition']);c.setAuthor('Omni Continue Studio');c.setSubject(data['application']+'の操作・動画取込ベータ注意・費用と診断')
 styles={
  'body':ParagraphStyle('body',fontName='JP',fontSize=10.0,leading=15.6,textColor=INK,wordWrap='CJK',spaceAfter=6),
  'small':ParagraphStyle('small',fontName='JP',fontSize=9.3,leading=14.4,textColor=MUTED,wordWrap='CJK'),
  'table':ParagraphStyle('table',fontName='JP',fontSize=9.0,leading=13.4,textColor=INK,wordWrap='CJK'),
  'thead':ParagraphStyle('thead',fontName='JP',fontSize=9.1,leading=13,textColor=white,wordWrap='CJK'),
  'beta':ParagraphStyle('beta',fontName='JP',fontSize=10.1,leading=16,textColor=AMBERINK,wordWrap='CJK'),
  'link':ParagraphStyle('link',fontName='JP',fontSize=10,leading=17,textColor=GREEN,wordWrap='CJK')}
 bounds=[]
 for page in data['pages']:
  num=page['number'];c.bookmarkPage('p'+str(num));c.addOutlineEntry(page['title'],'p'+str(num),0,False)
  c.setFillColor(GREEN);c.rect(0,H-9,W,9,fill=1,stroke=0)
  c.setFillColor(MUTED);c.setFont('JP',8);c.drawString(L,H-34,'OMNI CONTINUE / USER GUIDE');c.drawRightString(W-R,H-34,data.get('headerDate','2026-10-28')+'  |  '+data.get('headerVersion','c186c76'))
  y=H-67;c.setFillColor(GREEN);c.setFont('JP',10);c.drawString(L,y,page['eyebrow']);y-=32
  c.setFillColor(INK);c.setFont('JP',21 if num!=1 else 20);c.drawString(L,y,page['title']);y-=24
  def para(text,kind='body',indent=0,after=6):
   nonlocal y
   q=Paragraph(text,styles[kind]);w,h=q.wrap(CW-indent,1000)
   if y-h<BOTTOM:raise ValueError(f'Page {num} overflow: {text[:40]} y={y} h={h}')
   q.drawOn(c,L+indent,y-h);y-=h+after
  if page.get('lead'):para(escape(page['lead']),after=11)
  if page.get('beta'):
   q=Paragraph(escape(page['beta']),styles['beta']);ww,hh=q.wrap(CW-26,1000)
   c.setFillColor(AMBER);c.roundRect(L,y-hh-23,CW,hh+17,7,fill=1,stroke=0)
   c.setFillColor(AMBERINK);q.drawOn(c,L+13,y-hh-14);y-=hh+38
  for section in page['sections']:
   y-=4;c.setFillColor(GREEN);c.setFont('JP',12.4);c.drawString(L,y,section['heading']);y-=20
   for text in section.get('body',[]):
    if text.startswith('https://'):para('<link href="'+escape(text)+'" color="#266B52">'+escape(text)+'</link>',kind='link')
    else:para(escape(text))
   for i,text in enumerate(section.get('steps',[]),1):
    c.setFillColor(GREEN);c.setFont('JP',9.5);c.drawString(L,y-10.5,str(i)+'.');para(escape(text),indent=18,after=7)
   for target,title in section.get('toc',[]):para(f'<link href="#p{target}" color="#266B52">{target}  {escape(title)}</link>',kind='link',after=2)
   for label,url in section.get('links',[]):para('<link href="'+escape(url)+'" color="#266B52">'+escape(label)+'  ↗</link>',kind='link',after=2)
   if section.get('table'):
    rows=section['table'];cells=[[Paragraph(escape(v),styles['thead' if i==0 else 'table'])for v in row]for i,row in enumerate(rows)]
    widths=[CW*.34,CW*.66] if num in (6,8) else [CW*.29,CW*.71]
    table=Table(cells,colWidths=widths,hAlign='LEFT');table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),GREEN),('ROWBACKGROUNDS',(0,1),(-1,-1),[MINT,white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,-1),.4,LINE)]))
    tw,th=table.wrap(CW,1000)
    if y-th<BOTTOM:raise ValueError(f'Page {num} table overflow y={y} h={th}')
    table.drawOn(c,L,y-th);y-=th+12
   y-=3
  bounds.append({'page':num,'contentBottom':round(y,2)})
  c.setStrokeColor(LINE);c.setLineWidth(.6);c.line(L,39,W-R,39)
  c.setFillColor(MUTED);c.setFont('JP',8);c.drawString(L,25,'Omni Continue Studio  /  '+data.get('footerLabel','公開版')+' 利用ガイド');c.drawRightString(W-R,25,f'{num} / {len(data["pages"])}')
  c.showPage()
 c.save();print(json.dumps({'output':str(out),'pages':len(data['pages']),'bounds':bounds},ensure_ascii=False))
if __name__=='__main__':main()
