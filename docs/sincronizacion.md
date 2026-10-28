# Sincronizar dispositivos con Supabase

Sin esto, My-Guion guarda todo en el navegador donde lo usas: lo que marcas en
el celular no aparece en el computador. Con Supabase (gratis), cada persona
entra con su correo y la semana, las tomas, las casillas y el equipo se ven
igual en todos los dispositivos, y se actualizan en vivo.

Solo hay que hacerlo una vez, y lo hace quien administra la app.

## 1. Crear el proyecto (5 minutos)

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta (puede ser con GitHub).
2. **New project**:
   - Name: `My-Guion`
   - Database password: genera una y guardala (no la necesita la app).
   - Region: la mas cercana (por ejemplo `South America (Sao Paulo)`).
3. Espera a que termine de crearse (1 o 2 minutos).

## 2. Crear las tablas

1. En el menu izquierdo: **SQL Editor** > **New query**.
2. Pega todo el contenido de [`supabase.sql`](supabase.sql).
3. Al final del archivo, cambia los dos correos de ejemplo por los del equipo
   (uno por persona; pueden ser mas).
4. **Run**. Debe decir `Success`.

## 3. Decirle a Supabase donde vive la app

1. **Authentication** > **URL Configuration**.
2. **Site URL**: `https://luisrodriguez-rgb.github.io/My-Guion/`
3. En **Redirect URLs** agrega tambien `https://luisrodriguez-rgb.github.io/My-Guion/**`.
4. Guarda.

## 4. Conectar la app

1. **Project Settings** > **API** (o **Data API**).
2. Copia **Project URL** y la clave **anon public**.
3. Ponlas en [`js/config.js`](../js/config.js). La clave `anon` es publica a
   proposito: lo que protege los datos son las reglas del paso 2 (solo los
   correos del equipo pueden leer o escribir).

## 5. Entrar desde cada dispositivo

1. Abre la app > menu **⋯** > **Sincronizar dispositivos**.
2. Escribe tu correo y toca **Enviarme el enlace**.
3. Abre el enlace del correo **en el mismo navegador** (en el celular, el mismo
   navegador donde usas la app).

La primera vez, lo que ya tenias en ese navegador se junta con lo de la nube.
Si la misma semana estaba cargada en dos lados, se queda la de la nube.

## Si dice "No se pudo enviar el enlace"

La pantalla muestra el motivo. El mas comun es **"Email address not authorized"**:
el envio de correos gratuito de Supabase solo manda enlaces a los correos que
son parte del equipo de tu cuenta de Supabase. Hay dos salidas:

**A. Rapido: agregar a cada persona al equipo de Supabase**

1. En Supabase, arriba a la izquierda, entra a tu organizacion > **Team**.
2. **Invite member** con el correo de la persona (rol `Read-only` basta).
3. La persona acepta la invitacion que le llega por correo.
4. Desde ese momento ya le llegan los enlaces de My-Guion.

Ojo: con esto la persona tambien puede ver el panel de Supabase.

**B. Mejor a largo plazo: un servidor de correo propio (SMTP)**

Asi los enlaces llegan a cualquier correo del equipo sin invitarlo a Supabase,
y sin el limite de pocos correos por hora.

1. Crea una cuenta gratis en un servicio de correo como [Resend](https://resend.com)
   y saca la clave SMTP (o usa Gmail con una "contrasena de aplicacion").
2. En Supabase: **Authentication** > **Emails** > **SMTP Settings** > activa
   **Enable Custom SMTP** y llena servidor, puerto, usuario y clave.
3. Guarda y vuelve a pedir el enlace.

Otros motivos: **"rate limit"** significa que se pidieron muchos enlaces
seguidos (espera unos minutos); **"Signups not allowed"** significa que en
**Authentication** > **Sign In / Providers** esta apagado "Allow new users to
sign up".

## Agregar o quitar personas

En **SQL Editor**:

```sql
-- Agregar
insert into public.members (workspace_id, email)
select id, 'correo@ejemplo.com' from public.workspaces where name = 'Seamos Genios';

-- Quitar
delete from public.members where email = 'correo@ejemplo.com';
```

## Bueno saber

- El plan gratis de Supabase envia pocos correos por hora. Si el enlace no
  llega, espera unos minutos antes de pedir otro.
- Sin internet la app sigue funcionando; lo que marques se sube al volver la
  conexion.
- Cada dispositivo recuerda su propia posicion en el teleprompter y el tamano
  de letra; eso no se sincroniza.
