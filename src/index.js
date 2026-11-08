const DEST = 'sales@sunbeam-greece.com';
const MODELS = ['Not sure yet','SUNBEAM 22.1','SUNBEAM 29.1','SUNBEAM 29.1 GT','SUNBEAM 32.1','SUNBEAM 36.2'];
const reply = (status, obj) => new Response(JSON.stringify(obj), {
  status, headers: {'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff'}
});
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname !== '/api/enquiry')
      return reply(404, {ok: false, error: 'Not found'});
    if (request.method !== 'POST')
      return reply(405, {ok: false, error: 'Method not allowed'});
    const origin = request.headers.get('origin');
    if (origin && !['https://sunbeam-greece.com','https://www.sunbeam-greece.com'].includes(origin))
      return reply(403, {ok: false, error: 'Origin not allowed'});
    if (!(request.headers.get('content-type') || '').startsWith('application/json'))
      return reply(415, {ok: false, error: 'Use the website enquiry form'});
    if (Number(request.headers.get('content-length') || 0) > 12000)
      return reply(413, {ok: false, error: 'Enquiry is too long'});

    let data;
    try {
      const raw = await request.text();
      if (raw.length > 12000) return reply(413, {ok: false, error: 'Enquiry is too long'});
      data = JSON.parse(raw);
    } catch { return reply(400, {ok: false, error: 'Invalid enquiry'}); }

    if (!data || typeof data !== 'object' || Array.isArray(data))
      return reply(400, {ok: false, error: 'Invalid enquiry'});
    if (clean(data.website, 200))
      return reply(200, {ok: true, reference: 'received'});

    const d = {};
    for (const [k,max] of Object.entries({
      name:100,email:160,phone:50,model:80,budget:100,tradein:100,
      purchase_timeframe:50,message:2000
    })) d[k] = clean(data[k],max);
    if (d.name.length < 2 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email) ||
        data.contact_consent !== true)
      return reply(400, {ok:false,error:'Name, valid email and consent are required'});
    if (!MODELS.includes(d.model))
      return reply(400, {ok:false,error:'Invalid model'});
    if (!env.RESEND_API_KEY)
      return reply(503, {ok:false,error:'Email delivery is not configured'});

    const reference = 'SU-' + new Date().toISOString().slice(0,10).replace(/-/g,'')
      + '-' + crypto.randomUUID().slice(0,8).toUpperCase();
    const lines = ['New SUNBEAM Greece enquiry','Reference: '+reference,
      'Name: '+d.name,'Email: '+d.email,'Phone / WhatsApp: '+d.phone,
      'Model: '+d.model,'Budget: '+d.budget,'Current yacht: '+d.tradein,
      'Purchase timeframe: '+d.purchase_timeframe,'Buyer message: '+d.message,
      'Consent: Buyer agreed to be contacted.'];

    try {
      const sent = await fetch('https://api.resend.com/emails', {
        method:'POST',
        headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json'},
        body:JSON.stringify({
          from:'SUNBEAM Greece <no-reply@sunbeam-greece.com>',
          to:[DEST],reply_to:d.email,
          subject:'SUNBEAM Greece enquiry - '+d.model+' - '+reference,
          text:lines.join('\n')
        })
      });
      if (!sent.ok) {
        console.error('SUNBEAM Resend rejected email; status='+sent.status);
        return reply(502, {ok:false,error:'Email delivery failed; please use email or WhatsApp'});
      }
      return reply(200, {ok:true,reference});
    } catch(e) {
      console.error('SUNBEAM send temporarily unavailable');
      return reply(502, {ok:false,error:'Email delivery unavailable; please use email or WhatsApp'});
    }
  }
};
