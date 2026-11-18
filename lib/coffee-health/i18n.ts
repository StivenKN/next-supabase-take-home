import type { ColumnKey } from "./schema";

export type Locale = "en" | "es";

export const LOCALES: Record<Locale, { path: string; name: string }> = {
  en: { path: "/", name: "English" },
  es: { path: "/es", name: "Español" },
};

export type Dictionary = {
  title: string;
  tagline: string;
  columns: Record<ColumnKey, string>;
  filters: Record<ColumnKey, string>;
  /**
   * Display names for values stored in the database. The data is in English.
   * A value with no entry here shows as stored. A key of the form
   * "column:value" applies to that column only, for words whose translation
   * depends on what they describe.
   */
  values: Record<string, string>;
  yes: string;
  no: string;
  any: string;
  min: string;
  max: string;
  minOf: string;
  maxOf: string;
  between: string;
  atLeast: string;
  atMost: string;
  rangeInverted: string;
  clearFilter: string;
  clearOne: string;
  clearMany: string;
  rangeInData: string;
  filtersLabel: string;
  matchOne: string;
  matchMany: string;
  matchOfTotal: string;
  rowsRange: string;
  sortAscending: string;
  sortDescending: string;
  pagination: string;
  previous: string;
  next: string;
  page: string;
  pageOf: string;
  loading: string;
  tableCaption: string;
  language: string;
  toggleTheme: string;
  emptyTitle: string;
  emptyBody: string;
  outOfRangeTitle: string;
  outOfRangeBody: string;
  firstPage: string;
  setupTitle: string;
  setupBody: string;
  unreachableTitle: string;
  unreachableBody: string;
};

const en: Dictionary = {
  title: "Coffee and health",
  tagline: "Synthetic survey answers about coffee, sleep, and stress",
  columns: {
    id: "ID",
    age: "Age",
    gender: "Gender",
    country: "Country",
    occupation: "Occupation",
    caffeine_mg: "Caffeine, mg",
    coffee_intake: "Coffee, cups",
    sleep_hours: "Sleep, hours",
    sleep_quality: "Sleep quality",
    stress_level: "Stress",
    heart_rate: "Heart rate, bpm",
    bmi: "BMI",
    physical_activity_hours: "Activity, hours",
    health_issues: "Health issues",
    smoking: "Smokes",
    alcohol_consumption: "Drinks alcohol",
  },
  filters: {
    id: "ID",
    age: "Age",
    gender: "Gender",
    country: "Country",
    occupation: "Occupation",
    caffeine_mg: "Caffeine",
    coffee_intake: "Coffee",
    sleep_hours: "Sleep",
    sleep_quality: "Sleep quality",
    stress_level: "Stress",
    heart_rate: "Heart rate",
    bmi: "BMI",
    physical_activity_hours: "Activity",
    health_issues: "Health issues",
    smoking: "Smokes",
    alcohol_consumption: "Drinks alcohol",
  },
  values: {},
  yes: "Yes",
  no: "No",
  any: "Any",
  min: "Min",
  max: "Max",
  minOf: "Minimum {label}",
  maxOf: "Maximum {label}",
  between: "{min} to {max}",
  atLeast: "{min} or more",
  atMost: "up to {max}",
  rangeInverted: "The minimum is above the maximum, so nothing can match.",
  clearFilter: "Clear {label} filter",
  clearOne: "Clear 1 filter",
  clearMany: "Clear {count} filters",
  rangeInData: "The data goes from {min} to {max}.",
  filtersLabel: "Filters",
  matchOne: "{count} person",
  matchMany: "{count} people",
  matchOfTotal: "{count} of {total} people",
  rowsRange: "Showing {from} to {to}",
  sortAscending: "Sort by {label}, lowest first",
  sortDescending: "Sort by {label}, highest first",
  pagination: "Pages",
  previous: "Previous",
  next: "Next",
  page: "Page {page}",
  pageOf: "Page {page} of {last}",
  loading: "Loading rows",
  tableCaption: "Survey answers, one person per row",
  language: "Language",
  toggleTheme: "Switch between light and dark theme",
  emptyTitle: "No one matches these filters",
  emptyBody: "Widen a range or remove a filter to see people again.",
  outOfRangeTitle: "There is no page {page}",
  outOfRangeBody: "This view ends at page {last}.",
  firstPage: "Go to the first page",
  setupTitle: "The dataset is not loaded yet",
  setupBody:
    "Run this in the project folder to create the table and load the CSV, then reload the page.",
  unreachableTitle: "The database is not answering",
  unreachableBody:
    "Run this in the project folder to start Supabase and write .env.local, then restart the dev server.",
};

const es: Dictionary = {
  title: "Café y salud",
  tagline: "Respuestas sintéticas de una encuesta sobre café, sueño y estrés",
  columns: {
    id: "ID",
    age: "Edad",
    gender: "Género",
    country: "País",
    occupation: "Ocupación",
    caffeine_mg: "Cafeína, mg",
    coffee_intake: "Café, tazas",
    sleep_hours: "Sueño, horas",
    sleep_quality: "Calidad del sueño",
    stress_level: "Estrés",
    heart_rate: "Pulso, lpm",
    bmi: "IMC",
    physical_activity_hours: "Actividad, horas",
    health_issues: "Problemas de salud",
    smoking: "Fuma",
    alcohol_consumption: "Bebe alcohol",
  },
  filters: {
    id: "ID",
    age: "Edad",
    gender: "Género",
    country: "País",
    occupation: "Ocupación",
    caffeine_mg: "Cafeína",
    coffee_intake: "Café",
    sleep_hours: "Sueño",
    sleep_quality: "Calidad del sueño",
    stress_level: "Estrés",
    heart_rate: "Pulso",
    bmi: "IMC",
    physical_activity_hours: "Actividad",
    health_issues: "Problemas de salud",
    smoking: "Fuma",
    alcohol_consumption: "Bebe alcohol",
  },
  values: {
    Female: "Mujer",
    Male: "Hombre",
    Other: "Otro",
    "occupation:Other": "Otra",
    Healthcare: "Salud",
    Office: "Oficina",
    Service: "Servicios",
    Student: "Estudiante",
    Poor: "Mala",
    Fair: "Regular",
    Good: "Buena",
    Excellent: "Excelente",
    Low: "Bajo",
    Medium: "Medio",
    High: "Alto",
    None: "Ninguno",
    Mild: "Leves",
    Moderate: "Moderados",
    Severe: "Graves",
    Australia: "Australia",
    Belgium: "Bélgica",
    Brazil: "Brasil",
    Canada: "Canadá",
    China: "China",
    Finland: "Finlandia",
    France: "Francia",
    Germany: "Alemania",
    India: "India",
    Italy: "Italia",
    Japan: "Japón",
    Mexico: "México",
    Netherlands: "Países Bajos",
    Norway: "Noruega",
    "South Korea": "Corea del Sur",
    Spain: "España",
    Sweden: "Suecia",
    Switzerland: "Suiza",
    UK: "Reino Unido",
    USA: "Estados Unidos",
  },
  yes: "Sí",
  no: "No",
  any: "Cualquiera",
  min: "Mín.",
  max: "Máx.",
  minOf: "{label}, mínimo",
  maxOf: "{label}, máximo",
  between: "{min} a {max}",
  atLeast: "{min} o más",
  atMost: "hasta {max}",
  rangeInverted: "El mínimo supera al máximo, así que nada puede coincidir.",
  clearFilter: "Quitar el filtro de {label}",
  clearOne: "Quitar 1 filtro",
  clearMany: "Quitar {count} filtros",
  rangeInData: "Los datos van de {min} a {max}.",
  filtersLabel: "Filtros",
  matchOne: "{count} persona",
  matchMany: "{count} personas",
  matchOfTotal: "{count} de {total} personas",
  rowsRange: "Mostrando {from} a {to}",
  sortAscending: "Ordenar por {label}, de menor a mayor",
  sortDescending: "Ordenar por {label}, de mayor a menor",
  pagination: "Páginas",
  previous: "Anterior",
  next: "Siguiente",
  page: "Página {page}",
  pageOf: "Página {page} de {last}",
  loading: "Cargando filas",
  tableCaption: "Respuestas de la encuesta, una persona por fila",
  language: "Idioma",
  toggleTheme: "Cambiar entre tema claro y oscuro",
  emptyTitle: "Nadie coincide con estos filtros",
  emptyBody: "Amplía un rango o quita un filtro para volver a ver personas.",
  outOfRangeTitle: "No existe la página {page}",
  outOfRangeBody: "Esta vista termina en la página {last}.",
  firstPage: "Ir a la primera página",
  setupTitle: "El conjunto de datos aún no está cargado",
  setupBody:
    "Ejecuta esto en la carpeta del proyecto para crear la tabla y cargar el CSV. Después recarga la página.",
  unreachableTitle: "La base de datos no responde",
  unreachableBody:
    "Ejecuta esto en la carpeta del proyecto para iniciar Supabase y escribir .env.local. Después reinicia el servidor de desarrollo.",
};

const dictionaries: Record<Locale, Dictionary> = { en, es };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}

export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function clearFiltersLabel(t: Dictionary, count: number): string {
  return fill(count === 1 ? t.clearOne : t.clearMany, { count });
}

export function valueLabel(
  dictionary: Dictionary,
  value: string,
  column?: ColumnKey,
): string {
  // Object.hasOwn, because a value from the URL such as "toString" would
  // otherwise find a method on Object.prototype.
  const own = (key: string) =>
    Object.hasOwn(dictionary.values, key) ? dictionary.values[key] : undefined;
  return (column && own(`${column}:${value}`)) ?? own(value) ?? value;
}

const numberFormats: Partial<Record<string, Intl.NumberFormat>> = {};

export function formatNumber(
  locale: Locale,
  value: number,
  digits = 0,
): string {
  const key = `${locale}:${digits}`;
  numberFormats[key] ??= new Intl.NumberFormat(
    // Colombian Spanish writes 1.234,5 and, unlike es-ES, also groups
    // four-digit numbers.
    locale === "es" ? "es-CO" : "en-US",
    { minimumFractionDigits: digits, maximumFractionDigits: digits },
  );
  return numberFormats[key]!.format(value);
}
