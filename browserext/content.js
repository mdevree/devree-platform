// Realworks → n8n Sync
// Leest data uit het huidige frame bij page load en stuurt naar n8n

const WEBHOOK_URL = 'https://automation.devreemakelaardij.nl/webhook/realworks-sync';

(function () {

  function val(name) {
    const el = document.querySelector(`[name="${name}"]`);
    if (!el) return '';
    return el.value ? el.value.trim() : '';
  }

  function readContact() {
    return {
      firstname:  val('firstname') || val('christianname'),
      lastname:   val('lastname'),
      email:      val('email'),
      mobile:     val('mobile'),
      phone:      val('tel2') || val('tel1'),
      address:    [val('hstreet'), val('hhouseno'), val('hhousenoext')].filter(Boolean).join(' ').trim(),
      zipcode:    val('hzipcode'),
      city:       val('hcity'),
      salutation: val('saluation'),
      typerela:   val('typerela'),
      systemid:   val('_systemid'),
      rcode:      val('rcode'),
      source:     'realworks',
      page_url:   window.location.href,
    };
  }

  function init() {
    const contact = readContact();
    if (!contact.email && !contact.firstname && !contact.lastname) return;

    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contact)
    }).then(res => {
      if (res.ok) {
        console.log('[Realworks Sync] ✓ Verstuurd:', contact.email || contact.firstname);
      } else {
        console.warn('[Realworks Sync] Fout:', res.status);
      }
    }).catch(err => {
      console.warn('[Realworks Sync] Verbindingsfout:', err);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
