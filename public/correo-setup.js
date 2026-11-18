const el = id => document.getElementById(id);
el('destino').value = new URLSearchParams(location.hash.slice(1)).get('destino') || '';
el('config').onsubmit = async e => {
  e.preventDefault();
  el('pasos').hidden = true;
  try {
    const auth = await fetch('/api/correo/conectar',{method:'POST'});
    if (auth.status === 403) { el('estado').textContent='Primero iniciá sesión en el panel y volvé a este enlace.'; return; }
    const tpl = await fetch('/correo-plantilla.txt');
    if (!auth.ok || !tpl.ok) throw Error();
    const settings = {__API__:location.origin+'/api/correo/reservas',__KEY__:(await auth.json()).key,__TO__:el('destino').value.trim()};
    el('codigo').value = (await tpl.text()).replace(/__API__|__KEY__|__TO__/g,k=>JSON.stringify(settings[k]));
    el('pasos').hidden = false;
    el('estado').textContent='Completá estos pasos desde el Gmail que enviará los avisos.';
  } catch { el('estado').textContent='No se pudo preparar la conexión. Intentá de nuevo.'; }
};
el('copiar').onclick = async () => {
  try { await navigator.clipboard.writeText(el('codigo').value); el('estado').textContent='Código copiado.'; }
  catch { el('codigo').select(); el('estado').textContent='Copiá el texto seleccionado.'; }
};
