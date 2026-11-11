'use client';

import {useEffect, useState} from 'react';

export type ProjectOption = {id: string; name: string};

export default function ProjectPicker({linked, value, disabled, onChange}: {
 linked: ProjectOption[];
 value: ProjectOption | null;
 disabled: boolean;
 onChange: (project: ProjectOption | null) => void;
}) {
 const [query, setQuery] = useState('');
 const [results, setResults] = useState<ProjectOption[]>([]);
 const [status, setStatus] = useState('');
 const term = query.trim();
 useEffect(() => {
  if (term.length < 2) return;
  const controller = new AbortController();
  const timer = setTimeout(async () => {
   try {
    const response = await fetch('/api/projecten?limit=15&search=' + encodeURIComponent(term), {signal: controller.signal});
    if (!response.ok) throw Error();
    const data = await response.json();
    if (controller.signal.aborted) return;
    setResults(data.projects.map(({id, name}: ProjectOption) => ({id, name})));
    setStatus(data.pagination.total > 15 ? 'Meer dan 15 resultaten. Verfijn je zoekterm.' : data.projects.length ? '' : 'Geen projecten gevonden.');
   } catch {
    if (!controller.signal.aborted) setStatus('Projecten zoeken mislukt. Probeer het opnieuw.');
   }
  }, 250);
  return () => {clearTimeout(timer); controller.abort();};
 }, [term]);
 const options = new Map([...linked, ...results].map(p => [p.id, p]));
 if (value) options.set(value.id, value);
 return <fieldset disabled={disabled} className="space-y-2">
  <legend className="font-medium">Project bij dit gesprek</legend>
  <input type="search" aria-label="Zoek project op naam of adres" placeholder="Zoek project op naam of adres" className="w-full rounded border p-2" value={query} onChange={e => {
   setQuery(e.target.value); setResults([]); setStatus(e.target.value.trim().length >= 2 ? 'Zoeken…' : '');
  }}/>
  <small role="status">{status}</small>
  <select aria-label="Kies project" className="w-full rounded border p-2" value={value?.id || ''} onChange={e => onChange(options.get(e.target.value) || null)}>
   <option value="">Geen project gekoppeld</option>
   {Array.from(options.values()).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
 </fieldset>;
}
