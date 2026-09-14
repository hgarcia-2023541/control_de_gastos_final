// Utilidades de fechas compartidas por los módulos de ingresos y gastos.
// El backend es la autoridad final: compara contra la fecha REAL del
// servidor, nunca contra una fecha hardcodeada.

// Devuelve true si "fechaIso" (formato "yyyy-mm-dd") es un día
// posterior al día de hoy (según la zona horaria local del servidor).
export function esFechaFutura(fechaIso: string): boolean {
  const hoy = new Date();
  const inicioDeHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const fecha = new Date(`${fechaIso}T00:00:00`);
  return fecha.getTime() > inicioDeHoy.getTime();
}