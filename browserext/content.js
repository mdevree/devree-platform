// Realworks → n8n Sync
// Onderschept form saves en stuurt contactdata naar n8n voor verdere verwerking

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

  function send(data) {
    fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => {
      if (res.ok) {
        console.log('[Realworks Sync] ✓ Verstuurd:', data.email || data.firstname);
      } else {
        console.warn('[Realworks Sync] Fout:', res.status);
      }
    }).catch(err => {
      console.warn('[Realworks Sync] Verbindingsfout:', err);
    });
  }

  function init() {
    // Luister op alle forms in dit frame
    document.querySelectorAll('form').forEach(form => {
      form.addEventListener('submit', () => {
        const contact = readContact();
        if (contact.email || contact.firstname || contact.lastname) {
          send(contact);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
