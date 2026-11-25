"""Apply the housing-alert branch to an exported n8n workflow on stdin."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
workflow = json.load(sys.stdin)
entries = {"TaxatieMailarchivering01": "Email Trigger - melvin",
           "l8KLDm_MXaeqfiOqik5RS": "Email Trigger (IMAP)"}
entry = entries[workflow["id"]]
normalize = "Herken Realworks-woningmelding"
ingest = "Verwerk woningmelding in kantoorplatform"
origin = next(n for n in workflow["nodes"] if n["name"] == entry)
if origin.get("disabled"):
    raise ValueError("Mailboxingang is uitgeschakeld")
x, y = origin["position"]
nodes = [
    {"id":"woningmelding-normaliseren","name":normalize,"type":"n8n-nodes-base.code",
     "typeVersion":2,"position":[x+240,y+420],
     "parameters":{"jsCode":(root/"n8n/lib/housing-notification.code").read_text()}},
    {"id":"woningmelding-verwerken","name":ingest,"type":"n8n-nodes-base.httpRequest",
     "typeVersion":4.2,"position":[x+480,y+420],"retryOnFail":True,"maxTries":3,"waitBetweenTries":3000,
     "credentials":{"httpHeaderAuth":{"id":"PlatformWebhookSecret01","name":"Platform Webhook Secret"}},
     "parameters":{"method":"POST","url":"https://kantoor.devreemakelaardij.nl/api/woningmeldingen/ingest",
                   "authentication":"genericCredentialType","genericAuthType":"httpHeaderAuth",
                   "sendBody":True,"specifyBody":"json","jsonBody":"={{ JSON.stringify($json) }}","options":{}}}]
for node in nodes:
    previous = next((i for i,n in enumerate(workflow["nodes"]) if n["id"] == node["id"]),None)
    if previous is None:
        workflow["nodes"].append(node)
    else:
        workflow["nodes"][previous] = node
for src,dst in [(entry,normalize),(normalize,ingest)]:
    outputs = workflow["connections"].setdefault(src,{"main":[[]]})["main"][0]
    edge = {"node":dst,"type":"main","index":0}
    if edge not in outputs:
        outputs.append(edge)
print(json.dumps(workflow,ensure_ascii=False,indent=2))
