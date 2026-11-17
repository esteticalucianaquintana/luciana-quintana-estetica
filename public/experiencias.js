const admin = document.querySelector('main').dataset.vista === 'admin';
const endpoint = '/api/experiencias' + (admin ? '/admin' : '');
const lista = document.querySelector('#lista');
const mas = document.querySelector('#mas');
const estado = document.querySelector('#estado');
let cursor = '';
async function enviar(url, data) {
  return fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
}
async function cargar() {
  mas.disabled = true;
  try {
    const res = await fetch(endpoint + cursor);
    if (res.status === 401) { location.replace('/acceso.html'); return; }
    if (!res.ok) throw Error();
    const data = await res.json();
    for (const item of data.items) {
      const card = document.createElement('article');
      card.className = 'panel';
      const firma = document.createElement('strong');
      firma.textContent = [item.firma,item.servicio].filter(Boolean).join(' · ');
      const opinion = document.createElement('p');
      opinion.textContent = item.opinion;
      card.append(firma,opinion);
      if (admin) {
        for (const [label,value] of [['Publicar','publicada'],['Descartar','descartada']]) {
          const button = document.createElement('button');
          button.textContent = label;
          button.onclick = async () => {
            try {
              const result = await enviar(endpoint,{id:item.id,estado:value});
              if (!result.ok) throw Error();
              card.remove();
              estado.textContent = 'Opinión '+value+'.';
            } catch { estado.textContent = 'No se pudo guardar la decisión.'; }
          };
          card.append(button);
        }
      }
      lista.append(card);
      cursor = '?antes='+item.id;
    }
    mas.hidden = !data.mas;
    estado.textContent = lista.children.length ? '' : (admin ? 'No hay opiniones pendientes.' : 'Todavía no hay experiencias publicadas. Podés compartir la tuya.');
  } catch { estado.textContent = 'No se pudieron cargar las experiencias. Actualizá para reintentar.'; }
  finally { mas.disabled = false; }
}
mas.onclick = cargar;
const form = document.querySelector('#opinar');
if (form) form.onsubmit = async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    data.consentimiento = form.elements.consentimiento.checked;
    if (!(await enviar(endpoint,data)).ok) throw Error();
    form.reset();
    document.querySelector('#envio').textContent = 'Gracias. Luciana va a revisar tu experiencia antes de publicarla.';
  } catch { document.querySelector('#envio').textContent = 'No se pudo enviar. Revisá los datos e intentá otra vez.'; }
  finally { button.disabled = false; }
};
cargar();
