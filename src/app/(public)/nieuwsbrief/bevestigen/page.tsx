'use client';
import {useState} from 'react';
export default function ConfirmNewsletter(){
 const [message,setMessage]=useState('Klik hieronder om uw inschrijving voor de nieuwsbrief te bevestigen.');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false);
 async function confirm(){setBusy(true);try{const token=window.location.hash.slice(1);const r=await fetch('/api/public/newsletter/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const d=await r.json();setMessage(d.message||d.error);if(r.ok){setDone(true);window.history.replaceState(null,'',window.location.pathname);}}catch{setMessage('Bevestigen lukt tijdelijk niet. Probeer opnieuw.');}finally{setBusy(false);}}
 return <main className="mx-auto my-16 max-w-lg rounded-xl bg-white p-8 shadow"><h1 className="text-2xl font-bold">Nieuwe antwoorden in uw mailbox</h1><p className="my-5" role="status">{message}</p>{!done&&<button disabled={busy} onClick={confirm} className="rounded bg-green-900 px-5 py-3 text-white disabled:opacity-50">{busy?'Even geduld…':'Bevestig mijn inschrijving'}</button>}<p className="mt-6 text-sm">Maximaal één nieuwsbrief per maand. Afmelden kan altijd.</p><a className="mt-6 block underline" href="https://www.devreemakelaardij.nl/vragen/">Terug naar de vragen</a></main>;
}
