## Zwei Möglichkeiten, um Tests mit Vitest zu schreiben

| Kategorie     | Browser Mode (neu/empfohlen)         | jsdom + RTL (klassisch)                 |
|---------------|--------------------------------------|----------------------------------------|
| Paket         | vitest-browser-react                 | @testing-library/react + jsdom         |
| Umgebung      | Echter Browser (Playwright)          | Simulierter DOM                        |
| Assertions    | await expect.element(...)            | expect(...).toBeInTheDocument()        |
| Setup         | Komplexer                            | Einfacher                              |
| Für uns       | Overkill für den Einstieg            | Empfehlung für den Start               |

(=> Auszug aus Claude)

#### Links
https://vitest.dev/api/browser/react
https://vitest.dev/guide/learn/writing-tests.html
https://vitest.dev/guide/browser/component-testing