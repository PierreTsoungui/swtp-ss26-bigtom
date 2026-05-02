# Übersicht

## Technologien
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/)
- [React Router](https://reactrouter.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Material UI](https://mui.com/)

## Ordnerstruktur

Wir verwenden eine feature-basierte Architektur. Das bedeutet, dass der Code nach fachlichen Features und nicht nach technischen Typen (z. B. Komponenten global) organisiert wird.

Jedes Feature besitzt einen eigenen Ordner innerhalb von features. In diesem Ordner werden alle zugehörigen Dateien gebündelt.

Beispiel:
```text
features/
  user/
    components/
    hooks/
    utils/
    UserPage.tsx
```

Innerhalb eines Feature-Ordners kann die Struktur flexibel gestaltet werden. Typischerweise werden Unterordner wie folgende verwendet:

*components/* – UI-Komponenten, die nur in diesem Feature genutzt werden <br>
*hooks/* – Feature-spezifische Custom Hooks <br>
*utils/* – Hilfsfunktionen und Logik <br>
ggf. weitere Ordner je nach Bedarf <br>

Neben dem features-Ordner gibt es einen globalen shared-Ordner:
```
shared/
  components/
  hooks/
  utils/
```

Dieser enthält wiederverwendbare, feature-unabhängige Elemente, die in mehreren Features genutzt werden können, z. B.: generische UI-Komponenten (Buttons, Modals, etc.)
globale Hooks
allgemeine Utility-Funktionen

**Grundregel**: <br>
Feature-spezifisch → features/ <br>
Wiederverwendbar → shared/


## Styling
Wir verwenden Tailwind CSS für das Styling unserer Komponenten, statt klassischen CSS-Dateien. Tailwind ermöglicht es uns, direkt in unseren JSX-Dateien Klassen zu verwenden, um das Aussehen unserer Komponenten zu definieren.
Bspw. könnte eine Schaltfläche so aussehen:
```tsx
<button className="bg-blue-500 text-white px-4 py-2 rounded">
  Klick mich
</button>
```

Bei komplexeren Komponenten benutzen wir Material UI, um vorgefertigte Komponenten und Stile zu nutzen. Material UI bietet eine Vielzahl von Komponenten, die wir anpassen können, um sie an unser Design anzupassen.
Bspw. könnte eine Schaltfläche mit Material UI so aussehen:
```tsx import { Button } from '@mui/material';
<Button variant="contained" color="primary">
  Klick mich
</Button>
```
Wenn man in VS Code arbeitet, macht es Sinn, die Tailwind CSS IntelliSense Extension zu installieren, um die Autovervollständigung und Dokumentation für Tailwind-Klassen zu erhalten. Ebenso kann die Material UI Extension hilfreich sein, um die verfügbaren Komponenten und deren Props schnell zu durchsuchen.

## Routing
Wir verwenden React Router, um die Navigation zwischen verschiedenen Seiten unserer Anwendung zu ermöglichen. Jede Seite oder Ansicht wird als Route definiert, und wir können Komponenten basierend auf der aktuellen URL rendern. Diese Routen werden in der Regel in einer zentralen Datei wie `App.tsx` definiert, wo wir die verschiedenen Routen und die zugehörigen Komponenten festlegen. Bspw. könnte eine Route so aussehen:
```tsx
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';
import HomePage from './features/home/HomePage';
import UserPage from './features/user/UserPage';
<Router>
    <Route path="/" element={HomePage} />
    <Route path="/user" element={UserPage} />
    <Route path="*" element={<p>Page not found</p>} />
</Router>
```

## Entwicklung
Um die Entwicklung zu starten, führen Sie den folgenden Befehl im Terminal aus:
```bash
npm run dev
```
Das startet den Vite-Entwicklungsserver und öffnet die Anwendung in Ihrem Standard-Webbrowser. Sie können dann Änderungen am Code live vornehmen, und die Seite wird automatisch aktualisiert, um die Änderungen anzuzeigen.

Zuvor müssen Sie sicherstellen, dass alle Abhängigkeiten installiert sind. Führen Sie dazu den folgenden Befehl aus:
```bash
npm install
```

