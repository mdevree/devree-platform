#!/usr/bin/env python3
"""Read-only Postiz collector; writes only to the platform ingest endpoint.
Run on the host. The existing API credential stays in marketing-sync.json.
"""
import argparse, json, re, subprocess, sys, time
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlencode, urlsplit

CONFIG=Path('/home/DeVreeMakelaardij/.config/marketing-sync.json')
CATALOG=Path('/home/DeVreeMakelaardij/.config/social-publication-catalog.json')

def request(url, headers=None, body=None):
    for attempt in range(3):
        try:
            with urlopen(Request(url, data=json.dumps(body).encode() if body is not None else None, headers={**(headers or {}),'Content-Type':'application/json','User-Agent':'DeVree-Social-Archive/1.0'}),timeout=90) as r:return json.load(r)
        except Exception:
            if attempt==2:raise RuntimeError('Bron of import tijdelijk niet beschikbaar') from None
            time.sleep(2*(attempt+1))

def sql(query):
    r=subprocess.run(['docker','exec','-i','postiz-postgres','psql','-U','postiz-user','-d','postiz-db-local','-qtA','-v','ON_ERROR_STOP=1'],input='BEGIN READ ONLY;\n'+query+'\nROLLBACK;',text=True,capture_output=True,check=True)
    return json.loads(r.stdout)

def object_links():
    php='''$out=[];foreach(get_posts(['post_type'=>'woning','post_status'=>'any','numberposts'=>-1]) as $p){$out[]=['url'=>get_permalink($p->ID),'realworksId'=>get_post_meta($p->ID,'realworks_id',true)];}echo wp_json_encode($out);'''
    r=subprocess.run(['runuser','-u','DeVreeMakelaardij','--','/usr/local/bin/wp','--path=/home/DeVreeMakelaardij/web/devreemakelaardij.nl/public_html','eval',php],capture_output=True,text=True,check=True)
    return {v['url'].rstrip('/'):v['realworksId'] for v in json.loads(r.stdout) if v['realworksId']}

def decode(v,default):
    if isinstance(v,str):
        try:return json.loads(v)
        except ValueError:return default
    return v if v is not None else default

def catalog_entry(entry):
    return {'sourceUrl':entry.get('sourceUrl') or entry.get('source'), 'kind':entry.get('kind'), 'mediaUrl':entry.get('mediaURL') or entry.get('media'), 'realworksId':entry.get('realworksId'), 'topic':entry.get('topic'), 'scope':entry.get('scope'), 'classificationReason':entry.get('classificationReason')}

def classify(meta, source, content, object_id):
    if meta.get('scope') in ('property','general','unknown'):
        return meta['scope'],meta.get('classificationReason') or 'Beoordeelde contentregistratie'
    if object_id or source and '/aanbod/' in source:
        return 'property','Woningbron in contentplanning'
    topic=(meta.get('topic') or '').lower()
    if topic in ('woning','woningaanbod'):
        return 'property','Woningonderwerp in contentplanning'
    if source and any(x in urlsplit(source).path for x in ('/vragen/','/wonen/','/beoordelingen/','marktupdate')):
        return 'general','Algemene bronpagina: '+urlsplit(source).path
    if topic in ('faq','vraag & antwoord','wonen','buurt','markt','woningmarkt','beoordeling','beoordelingen') or 'bekijk vragen en antwoorden' in content.lower():
        return 'general','Algemeen onderwerp of vraag-en-antwoordverwijzing'
    if re.search(r'bekijk (?:deze |de )?woning op onze website',content,re.I):
        return 'property','Woningverwijzing; project nog vaststellen'
    return 'unknown',None

def enrich_shared_media(rows):
    # Only a unique, verified object identity may be inherited. Never infer a
    # property from a stock/background image in an explicitly general post.
    identities={}
    for row in rows:
        if row['mediaUrl'] and row['realworksId'] and row['scope']=='property':
            identities.setdefault(row['mediaUrl'],set()).add(row['realworksId'])
    for row in rows:
        ids=identities.get(row['mediaUrl'],set())
        if not row['realworksId'] and row['scope']!='general' and len(ids)==1:
            row.update(realworksId=next(iter(ids)),scope='property',classificationReason='Exact hetzelfde beeldbestand als een geverifieerd woningbericht')
    return rows

def build_row(p,extra,catalog,links):
    meta=catalog.get(p['id'],{})
    settings=decode(extra.get('settings'),{});media=decode(extra.get('image'),[])
    paths=[m.get('path','') for m in media if isinstance(m,dict)]
    kind='unknown';pt=settings.get('post_type','')
    if pt=='story' or '/stories/' in (p.get('releaseURL') or ''):kind='story'
    elif pt in ('reel','reels') or '/reel/' in (p.get('releaseURL') or '') or '/reels/' in (p.get('releaseURL') or ''):kind='reel'
    elif any('.mp4' in f.lower() or '.mov' in f.lower() for f in paths):kind='video'
    elif len(paths)>1:kind='carousel'
    elif paths:kind='photo'
    if kind=='unknown' and meta.get('kind') in ('photo','carousel','reel','story','video'):kind=meta['kind']
    provider=p['integration']['providerIdentifier'];provider=provider if provider in ('facebook','instagram','youtube','tiktok','gmb','linkedin-page','linkedin','pinterest') else 'other'
    state=p['state']
    if provider=='tiktok' and state=='PUBLISHED' and settings.get('content_posting_method')=='UPLOAD':state='DRAFT'
    source=meta.get('sourceUrl') or None
    # Historical catalogs also contain prose/PDF references, not only URLs.
    if source and (urlsplit(source).scheme!='https' or not urlsplit(source).hostname):source=None
    content=p.get('content') or ''
    if not source:
        urls=[u.rstrip('/.,') for u in re.findall(r'https://[^\s<>"\x27]+',content)]
        found=[u for u in urls if u in links]
        if len(set(found))==1:source=found[0]
        elif len(set(urls))==1 and urlsplit(urls[0]).hostname in ('www.devreemakelaardij.nl','devreemakelaardij.nl'):source=urls[0]
    object_id=meta.get('realworksId') or links.get((source or '').rstrip('/'))
    scope,reason=classify(meta,source,content,object_id)
    return dict(sourceId=p['id'],accountId=p['integration']['id'],channel=provider,account=p['integration']['name'],kind=kind,content=content,state=state,scheduledAt=(p.get('publishDate').replace(' ','T')+'Z' if p.get('publishDate') and not p['publishDate'].endswith('Z') else p.get('publishDate')),publishedAt=None,releaseId=p.get('releaseId'),releaseUrl=p.get('releaseURL'),mediaUrl=paths[0] if paths else meta.get('mediaUrl'),sourceUrl=source,removed=bool(extra.get('deletedAt')),realworksId=object_id,scope=scope,classificationReason=reason)

def run(dry=False):
    c=json.loads(CONFIG.read_text());base=c['postizUrl'].rstrip('/');platform=c['platformUrl'].rstrip('/')
    if urlsplit(base).hostname!='postiz.devreemakelaardij.nl' or urlsplit(platform).hostname not in ('127.0.0.1','localhost','kantoor.devreemakelaardij.nl'):raise RuntimeError('Onverwachte configuratie')
    extras=sql("""SELECT COALESCE(json_agg(t),\'[]\'::json) FROM (SELECT p.id,p.image,p.settings,p."deletedAt",p."parentPostId",p."publishDate",p.content,p.state,p."releaseURL",p."releaseId",json_build_object('id',i.id,'name',i.name,'providerIdentifier',i."providerIdentifier") AS integration FROM "Post" p JOIN "Integration" i ON i.id=p."integrationId") t;""")
    earliest=min(x['publishDate'] for x in extras)
    posts=request(base+'/posts?'+urlencode({'startDate':'2000-01-01T00:00:00Z','endDate':'2100-01-01T00:00:00Z'}),{'Authorization':c['postizApiKey']})['posts']
    allowed={i['id'] for i in request(base+'/integrations',{'Authorization':c['postizApiKey']})}
    visible={p['id'] for p in posts}
    posts.extend(p for p in extras if p['id'] not in visible and p['deletedAt'] and p['integration']['id'] in allowed)
    catalog={}
    for path in sorted(Path('/opt').glob('devree-social-week*/catalog.json')):
        for entry in json.loads(path.read_text()):
            if entry.get('postId'):
                catalog[entry['postId']]=catalog_entry(entry)
    if CATALOG.exists():
        for key,entry in json.loads(CATALOG.read_text()).items():catalog[key]={**catalog.get(key,{}),**entry}
    links=object_links();lookup={x['id']:x for x in extras}
    rows=enrich_shared_media([build_row(p,lookup.get(p['id'],{}),catalog,links) for p in posts if p['id'] in lookup and not lookup[p['id']]['parentPostId']])
    # Records no longer returned by Postiz are retained in the platform; absence never means deletion.
    stamp=datetime.now(timezone.utc).isoformat();since=earliest.replace(' ','T')+'Z'
    if dry:
        print(json.dumps({'posts':len(rows),'linkedByObjectCode':sum(bool(x['realworksId']) for x in rows),'since':since,'scopes':{k:sum(x['scope']==k for x in rows) for k in ('property','general','unknown')},'types':{k:sum(x['kind']==k for x in rows) for k in ('photo','carousel','video','reel','story','unknown')}}));return
    for offset in range(0,len(rows),40):
        request(platform+'/api/social/ingest',{'x-webhook-secret':c['webhookSecret']},{'capturedAt':stamp,'since':since,'complete':False,'rows':rows[offset:offset+40]})
    request(platform+'/api/social/ingest',{'x-webhook-secret':c['webhookSecret']},{'capturedAt':stamp,'since':since,'complete':True,'rows':[]})
    print(json.dumps({'ok':True,'imported':len(rows),'matchedObjectCodes':sum(bool(x['realworksId']) for x in rows)}))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--dry-run',action='store_true');args=parser.parse_args()
    try:run(args.dry_run)
    except Exception as e:
        print(json.dumps({'ok':False,'error':str(e) if isinstance(e,RuntimeError) else 'Social synchronisatie mislukt; laatste gegevens blijven bewaard'}));sys.exit(1)
