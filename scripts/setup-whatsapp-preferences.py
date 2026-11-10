import json,sqlite3,urllib.request,uuid,sys
con=sqlite3.connect('file:/var/lib/docker/volumes/n8n_n8n_data/_data/database.sqlite?mode=ro',uri=True)
key=con.execute('SELECT apiKey FROM user_api_keys LIMIT 1').fetchone()[0]
def api(method,path='',body=None):
 r=urllib.request.Request('http://127.0.0.1:5678/api/v1/workflows'+path,data=json.dumps(body).encode() if body is not None else None,headers={'X-N8N-API-KEY':key,'Content-Type':'application/json'},method=method)
 with urllib.request.urlopen(r,timeout=30) as f:return json.load(f)
header={'httpHeaderAuth':{'id':'PlatformWebhookSecret01','name':'Platform Webhook Secret'}}
def node(name,typ,params,version=1,credentials=None):
 n={'id':str(uuid.uuid4()),'name':name,'type':'n8n-nodes-base.'+typ,'typeVersion':version,'position':[0,0],'parameters':params}
 if credentials:n['credentials']=credentials
 return n
def save(name,nodes,links,active):
 existing=[w for w in api('GET','?limit=250')['data'] if w['name']==name]
 if existing:
  print(json.dumps({'name':name,'id':existing[0]['id'],'active':existing[0]['active']}));return
 w=api('POST','',{'name':name,'nodes':nodes,'connections':{a:{'main':[[{'node':b,'type':'main','index':0}]]} for a,b in links},'settings':{'executionOrder':'v1','saveDataSuccessExecution':'all' if 'central worker' in name else 'none','saveDataErrorExecution':'all' if 'central worker' in name else 'none'}})
 if active:api('POST','/'+w['id']+'/activate',{'versionId':w['versionId']})
 print(json.dumps({'name':name,'id':w['id'],'active':active}))
if sys.argv[1]=='gateway':
 nodes=[node('Webhook','webhook',{'httpMethod':'POST','path':'whatsapp-preference-extract','responseMode':'responseNode','authentication':'headerAuth'},2,header),node('Extract','httpRequest',{'method':'POST','url':'https://api.openai.com/v1/responses','authentication':'predefinedCredentialType','nodeCredentialType':'openAiApi','sendBody':True,'specifyBody':'json','jsonBody':"={{ JSON.stringify({ model: 'gpt-5-mini', store: false, input: $json.body.input }) }}",'options':{'timeout':120000}},4.4,{'openAiApi':{'id':'UdiNlc10HwLGX8Uz','name':'OpenAi account'}}),node('Respond','respondToWebhook',{'respondWith':'json','responseBody':'={{ JSON.stringify($json) }}'},1.4)]
 nodes[0]['webhookId']=str(uuid.uuid4())
 save('WhatsApp preference extraction',nodes,[('Webhook','Extract'),('Extract','Respond')],True)
else:
 nodes=[node('Every minute','scheduleTrigger',{'rule':{'interval':[{'field':'minutes','minutesInterval':1}]}},1.2),node('Process saved replies','httpRequest',{'method':'POST','url':'http://127.0.0.1:3100/api/whatsapp/preferences/process','authentication':'genericCredentialType','genericAuthType':'httpHeaderAuth','options':{'timeout':180000}},4.4,header)]
 save('WhatsApp preferences - central worker',nodes,[('Every minute','Process saved replies')],True)
