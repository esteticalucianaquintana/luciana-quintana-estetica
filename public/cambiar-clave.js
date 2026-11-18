const form=document.querySelector('#cambiarClave');
form.onsubmit=async event=>{
  event.preventDefault();
  const status=form.querySelector('[role=status]');
  const button=form.querySelector('button');
  if(form.nueva.value!==form.repetida.value){status.textContent='Las dos claves deben coincidir.';return}
  button.disabled=true;
  try {
    const response=await fetch('/api/auth/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:form.nueva.value,remember:form.recordar.checked})});
    const result=await response.json();
    if(!response.ok)throw Error(result.error);
    form.reset();
    status.textContent='Clave guardada. Usala la próxima vez que entres al panel.';
  } catch(error){status.textContent=error.message}
  finally{button.disabled=false}
};
