import type { Metadata } from "next";
import { getStoreSettings } from "@/actions/store-settings";
import { LegalPage, LegalSection } from "@/components/storefront/legal-page";

export const metadata: Metadata = {
  title: "Privacidad",
  description: "Cómo se usan y protegen los datos personales en la tienda.",
  alternates: { canonical: "/privacidad" },
};

export default async function PrivacyPage() {
  const settings = await getStoreSettings();

  return (
    <LegalPage
      eyebrow="Tus datos"
      title="Política de privacidad"
      intro="Usamos únicamente la información necesaria para procesar compras, coordinar entregas y atender consultas."
    >
      <LegalSection title="Datos que tratamos">
        <p>
          Podemos recibir nombre, email, teléfono, dirección de entrega,
          historial de pedidos y datos técnicos básicos de navegación.
        </p>
        <p>
          Los datos completos de tarjetas no son almacenados por la tienda:
          el pago se procesa en Mercado Pago.
        </p>
      </LegalSection>
      <LegalSection title="Para qué los usamos">
        <p>
          Para crear y administrar pedidos, validar pagos, reservar stock,
          coordinar retiro o entrega, responder consultas y cumplir obligaciones
          legales.
        </p>
      </LegalSection>
      <LegalSection title="Estadísticas de navegación">
        <p>
          Registramos de forma anónima pasos básicos como páginas y prendas
          vistas, uso del carrito, llegada al checkout y compras completadas.
          Esto nos permite detectar dificultades y mejorar la tienda.
        </p>
        <p>
          Estas estadísticas no guardan IP, email, teléfono, dirección ni el
          texto escrito en las búsquedas. El navegador conserva un identificador
          aleatorio para reconocer el recorrido entre páginas.
        </p>
      </LegalSection>
      <LegalSection title="Proveedores">
        <p>
          La operación puede involucrar a Mercado Pago para pagos, Supabase
          para infraestructura de datos, Clerk para cuentas de usuario, Vercel
          para alojamiento y Resend para emails transaccionales cuando esté
          configurado.
        </p>
      </LegalSection>
      <LegalSection title="Consultas y derechos">
        <p>
          Podés solicitar acceso, actualización o eliminación de tus datos
          escribiendo a {settings.contact_email}. Conservaremos la información
          que deba mantenerse por obligaciones legales o contables.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
