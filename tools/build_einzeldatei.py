#!/usr/bin/env python3
"""Baut DienstPlanPro-Einzeldatei.html aus den Quelldateien in DienstPlanPro/.
Aufruf (im Projektordner):  python3 tools/build_einzeldatei.py
- styles.css und i18n.js werden direkt eingebettet
- app.js wird als <script type="text/plain" id="dp-app-src"> eingebettet;
  supabase.js lädt zuerst die Daten aus Supabase und startet danach die App.
"""
import os,sys
root=os.path.abspath(sys.argv[1]) if len(sys.argv)>1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out=sys.argv[2] if len(sys.argv)>2 else os.path.join(root,'DienstPlanPro-Einzeldatei.html')
d=os.path.join(root,'DienstPlanPro')
rd=lambda n:open(os.path.join(d,n),encoding='utf-8').read()
idx,css,i18n,app,sb=rd('index.html'),rd('styles.css'),rd('i18n.js'),rd('app.js'),rd('supabase.js')
for name,code in (('i18n.js',i18n),('app.js',app),('supabase.js',sb)):
    if '</script' in code.lower(): sys.exit(f'{name} enthält "</script" – kann nicht eingebettet werden')
def blk(tag,body,attrs=''): return f'  <{tag}{attrs}>\n{body}\n</{tag}>'
def put(s,a,b):
    assert s.count(a)==1,a; return s.replace(a,b)
idx=put(idx,'  <link rel="stylesheet" href="styles.css">',blk('style',css))
idx=put(idx,'  <script src="i18n.js"></script>',blk('script',i18n))
idx=put(idx,'  <script src="supabase.js"></script>',blk('script',app,' type="text/plain" id="dp-app-src"')+'\n'+blk('script',sb))
open(out,'w',encoding='utf-8').write(idx)
print('geschrieben:',out)
