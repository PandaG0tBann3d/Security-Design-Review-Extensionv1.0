// content.js  – enhanced collector

chrome.runtime.onMessage.addListener((req, _, send) => {
  if (req.action !== 'collectBasics') return;

  try {
    /* external scripts */
    const scriptSrcs = [...document.querySelectorAll('script[src]')]
                         .map(s => s.src).slice(0, 30);

    /* first 5 inline snippets (200 chars each) */
    const inlineSnips = [...document.querySelectorAll('script:not([src])')]
                          .slice(0, 5)
                          .map(s => s.textContent.slice(0, 200));

    /* PHP links */
    const phpLinks = [
      ...document.querySelectorAll('a[href$=".php"], form[action$=".php"]')
    ].map(el => el.href || el.action);

    /* page classification */
    const pageType = document.querySelector('input[type=password]') ? 'login'
                   : /cart|checkout/i.test(location.href)           ? 'cart'
                                                                    : 'generic';

    /* HTML snippet (head + 1 500 chars of body) */
    const head = document.head.innerHTML.slice(0, 800);
    const body = document.body.innerHTML.slice(0, 1500);
    const htmlSnippet = `<head>\n${head}\n<body>\n${body}`;

    /* cookie & storage */
    const cookieStr   = document.cookie.slice(0, 300);
    const localKeys   = Object.keys(localStorage).slice(0, 10);
    const sessionKeys = Object.keys(sessionStorage).slice(0, 10);

    /* form inputs */
    const inputFields = [...document.querySelectorAll('input,textarea')]
      .map(el => ({ name: el.name || '', type: el.type || el.tagName }));

    send({
      ok: true,
      data: { scriptSrcs, inlineSnips, phpLinks, htmlSnippet,
              cookieStr, localKeys, sessionKeys, inputFields, pageType }
    });
  } catch (e) {
    send({ ok: false, error: e.message });
  }
});
