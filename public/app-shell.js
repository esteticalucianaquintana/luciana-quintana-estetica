// Keep the existing installed-app identity while moving its launch to the home page.
const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
const legacyAgenda=/^\/agenda-lucy(?:\.html)?\/?$/.test(window.location.pathname);
if(standalone&&legacyAgenda&&!document.referrer){window.location.replace('/');}
if('serviceWorker' in navigator){navigator.serviceWorker.register('/agenda-sw.js').catch(()=>{});}
