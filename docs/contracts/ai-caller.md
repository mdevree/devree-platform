# Contract: AI caller

Laatst bijgewerkt: 2026-07-12.

Dit contract beschrijft de gecontroleerde keten platform -> caller/PBX bridge ->
platform voor de AI-belassistent.

## Richting

1. Platform maakt een `AiCallJob`.
2. Medewerker keurt handmatig goed met exacte tekst `BEL`.
3. Platform stuurt startpayload naar de caller start-webhook of direct naar de
   PBX bridge.
4. PBX bridge start de outbound call.
5. PBX bridge post het resultaat terug naar het platform.

## Authenticatie

Server-to-server requests gebruiken:

```http
x-webhook-secret: <N8N_WEBHOOK_SECRET>
```

Starten vereist daarnaast een expliciet approval-blok. Zowel platform als PBX
bridge moeten requests zonder approval weigeren.

## Start endpoint

Platform route:

```http
POST /api/ai/call-jobs/[id]/start
```

Caller/PBX bridge payload:

```json
{
  "job": {
    "id": "cmq...",
    "contactName": "Sanne de Jong",
    "contactPhone": "0612636255",
    "language": "nl",
    "propertyTitle": "Kikkerven 255",
    "propertyAddress": "Kikkerven 255",
    "propertyUrl": "https://www.devreemakelaardij.nl/aanbod/",
    "context": {
      "callGoals": [
        "vraag of het uitkomt",
        "vraag naar algemene indruk",
        "noteer technische vragen letterlijk"
      ]
    },
    "scriptPreview": "Opening: Goedemiddag Sanne, met de digitale assistent van De Vree Makelaardij. Komt het uit?"
  },
  "approval": {
    "humanApproved": true,
    "approvalText": "BEL",
    "reviewedBy": "medewerker"
  }
}
```

### Vereiste startvelden

| Veld | Verplicht | Opmerking |
| --- | --- | --- |
| `job.id` | Ja | Platform `AiCallJob.id` |
| `job.contactPhone` | Ja | Belbaar telefoonnummer |
| `job.scriptPreview` | Ja | Korte opening en instructie |
| `approval.humanApproved` | Ja | Moet `true` zijn |
| `approval.approvalText` | Ja | Moet exact `BEL` zijn |
| `approval.reviewedBy` | Ja | Medewerker of systeemnaam |

## Result endpoint

Platform route:

```http
POST /api/ai/call-results
```

Payload:

```json
{
  "aiCallJobId": "cmq...",
  "pbxCallId": "1782155103.103",
  "provider": "google_live",
  "contextName": "devree_bezichtiging_followup",
  "durationSeconds": 42,
  "outcome": "answered",
  "summary": "Korte samenvatting",
  "transcript": "assistant: ...\nuser: ...",
  "customerQuestions": [
    "Vraag over de vloerconstructie"
  ],
  "detectedOpportunities": [],
  "requestedFollowUp": {
    "channel": "phone",
    "reason": "technische vraag beantwoorden"
  },
  "proposedLinks": []
}
```

### Vereiste resultvelden

| Veld | Verplicht | Opmerking |
| --- | --- | --- |
| `aiCallJobId` | Ja | Koppeling naar platform job |
| `outcome` | Ja | Bijvoorbeeld `answered`, `voicemail`, `no_answer`, `failed` |
| `durationSeconds` | Nee | Wel gewenst voor analyse |
| `summary` | Nee | Bij live gesprek gewenst |
| `transcript` | Nee | Bij live gesprek gewenst |
| `customerQuestions` | Nee | Lijst met letterlijke klantvragen |
| `requestedFollowUp` | Nee | Gestructureerde opvolging |

## Foutgedrag

- Geen geldige `x-webhook-secret`: HTTP 401.
- Geen approval of approval ongeldig: HTTP 400.
- Caller start faalt: platform zet job op `failed` en bewaart fout in review notes.
- PBX/audio probleem: resultaat post met `outcome: "failed"` en duidelijke
  foutnotitie.

## Veiligheidsregels

- Geen call zonder menselijke `BEL`-goedkeuring.
- AI mag geen documenten, links of technische details beloven zonder bron in de
  belkaartcontext.
- Technische of objectspecifieke vragen letterlijk noteren en doorzetten naar
  kantoor.
- Follow-up via WhatsApp of e-mail blijft eerst concept tenzij expliciet anders
  gebouwd.
