// This file is the web-safe entry point for the Mapa tab.
// Metro resolves .web.tsx before .tsx on web, so this file
// is only loaded on native. On web, mapa.web.tsx is loaded instead.
export { default } from "./mapa.native";
