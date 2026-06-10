\# Review\_TT-4: Review des Sequenzdiagramms



\## 1. Ziel des Reviews



Ziel dieses Reviews ist die Überprüfung des Sequenzdiagramms `tt-4-sequence-diagram.puml` für den aktuellen Systemstand der BigTom-Anwendung.



Geprüft wurden die dargestellten Interaktionen zwischen User, Frontend, FastAPI-Backend und R Worker sowie die UML-/PlantUML-Notation, Vollständigkeit und Verständlichkeit des Diagramms.



\## 2. Allgemeine Bewertung



Das Sequenzdiagramm ist insgesamt gut strukturiert und verständlich. Die wichtigsten Komponenten sind korrekt dargestellt:



\* User

\* Frontend

\* FastAPI Backend

\* R Worker



Auch die wichtigsten Prozessphasen sind enthalten:



\* Upload und Filterung

\* Normalisierungsvorschau

\* Normalisierung

\* Batch-Korrektur

\* Downstream-Analyse

\* Ergebnisabruf

\* Reset bzw. Abbruch



Die Verwendung von `group`, `loop`, `alt`, `else` und `note` ist sinnvoll. Besonders das Status-Polling ist durch `loop`-Blöcke gut nachvollziehbar dargestellt.



\## 3. Bestätigte Punkte



Folgende dargestellte Endpunkte und Abläufe stimmen grundsätzlich mit dem aktuellen Backend überein:



\* `POST /api/v1/upload`

\* `GET /api/v1/status/{job\_id}`

\* `GET /api/v1/filter/{job\_id}/stats`

\* `GET /api/v1/preview/normalization/{job\_id}`

\* `GET /api/v1/preview/normalization/{job\_id}/{plot\_name}`

\* `POST /api/v1/normalize/{job\_id}`

\* `GET /api/v1/batch/{job\_id}/history`

\* `GET /api/v1/batch/{job\_id}/svd-plot/{round\_id}`

\* `POST /api/v1/batch/{job\_id}`

\* `POST /api/v1/batch/{job\_id}/skip`

\* `POST /api/v1/reset/{job\_id}`



Der Reset-Endpunkt ist korrekt als `/reset/{job\_id}` dargestellt. Ein `/cancel/{job\_id}`-Endpoint existiert im aktuellen Backend nicht.



Auch die automatische Erstellung der Normalisierungsvorschau nach erfolgreicher Filterung ist grundsätzlich korrekt dargestellt. Ein separater POST-Endpunkt zum Starten der Preview ist aktuell nicht implementiert.



\## 4. Festgestellte Abweichungen



\### 4.1 Status `waiting\_selection` fehlt



Nach erfolgreicher Normalisierungsvorschau setzt das Backend den Job auf:



\* `status = "waiting"`

\* `phase = "waiting\_selection"`



Dieser Zustand fehlt im Diagramm. Dadurch ist nicht direkt erkennbar, dass das System nach der Preview auf die Auswahl einer Normalisierungsmethode durch den User wartet.



\*\*Verbesserungsvorschlag:\*\*

Nach der Preview sollte ergänzt werden:



`BE -> BE : update\_job(status:"waiting", phase:"waiting\_selection")`



\### 4.2 Filterstatistik-Response ist ungenau



Der Endpoint `GET /api/v1/filter/{job\_id}/stats` ist korrekt. Die dargestellte Response-Struktur stimmt jedoch nicht exakt.



Im Diagramm steht:



`{ filter\_stats: {...} }`



Das Backend gibt die Filterstatistik jedoch direkt zurück. Außerdem heißen die Felder eher `total\_start`, `total\_end`, `total\_removed` und enthalten einzelne Filterblöcke.



\*\*Verbesserungsvorschlag:\*\*

Die Response-Struktur sollte an das tatsächliche Backend angepasst werden.



\### 4.3 SVD-Plot-Skript ist falsch benannt



Im Diagramm wird `generate\_svd\_plot.R` verwendet. Im aktuellen System wird der SVD-Plot jedoch über `batch\_svd.R` erzeugt.



\*\*Verbesserungsvorschlag:\*\*

`generate\_svd\_plot.R` durch `batch\_svd.R` ersetzen.



\### 4.4 Batch-Ablauf weicht vom aktuellen System ab



Der tatsächliche Ablauf der Batch-Korrektur ist:



1\. `batch\_correct.R`

2\. Ausgabe `corrected\_data.rds`

3\. `batch\_svd.R`

4\. Aktualisierung von `batch\_history.json`



Im Diagramm ist die Reihenfolge anders dargestellt. Außerdem gehört `available\_columns` nicht zur History-Response, sondern zum separaten Endpoint:



`GET /api/v1/batch/{job\_id}/batch-options`



\*\*Verbesserungsvorschlag:\*\*

Batch-Reihenfolge korrigieren und `/batch-options` ergänzen.



\### 4.5 DMP-/DMR-Analyse ist teilweise ungenau



DMP und DMR sind implementiert, aber einige Details im Diagramm stimmen nicht exakt:



\* Aktuell läuft DMR vor DMP.

\* Ergebnisse werden als CSV/RDS gespeichert, nicht als SQLite.

\* Der finale Zustand lautet `status="analysis\_done"` und `phase="downstream\_analysis"`.

\* Im Diagramm steht stattdessen `status:"completed"` und `phase:"done"`.



\*\*Verbesserungsvorschlag:\*\*

Reihenfolge, Ergebnisformate und finale Statuswerte anpassen.



\### 4.6 Ergebnis-Endpoint ist falsch dargestellt



Im Diagramm steht:



`GET /api/v1/table/{job\_id}?page=1\&page\_size=100`



Der tatsächliche Endpoint lautet:



`GET /api/v1/table/{job\_id}/{table}?page=1`



Dabei ist `{table}` zum Beispiel `dmp` oder `dmr`.



Außerdem ist `page\_size` aktuell nicht als Backend-Parameter implementiert. Die Seitengröße ist fest auf 75 gesetzt.



\*\*Verbesserungsvorschlag:\*\*

Endpoint und Response-Struktur im Diagramm korrigieren.



\## 5. Verständlichkeit für neue Teammitglieder



Das Diagramm ist grundsätzlich gut verständlich und eignet sich als Überblick über den Workflow. Die Gruppierung der Prozessphasen und die Notizen zu den R-Skripten helfen beim Verständnis.



Einige Details könnten für neue Teammitglieder jedoch missverständlich sein, insbesondere der fehlende Zustand `waiting\_selection`, der ungenaue Batch-Ablauf und der falsche Ergebnis-Endpoint.



\## 6. Fazit



Das Sequenzdiagramm ist insgesamt gut gemacht und bildet den BigTom-Workflow weitgehend korrekt ab. Die UML-/PlantUML-Notation ist sinnvoll eingesetzt und die Hauptkomponenten sind klar erkennbar.



Für eine aktuelle und präzise Dokumentation sollten jedoch folgende Punkte angepasst werden:



\* `waiting\_selection` nach der Normalisierungsvorschau ergänzen

\* Filterstats-Response korrigieren

\* `generate\_svd\_plot.R` durch `batch\_svd.R` ersetzen

\* Batch-Ablauf korrigieren

\* `/batch-options` ergänzen

\* DMR vor DMP darstellen

\* Ergebnisformate CSV/RDS statt SQLite dokumentieren

\* Ergebnis-Endpoint auf `/table/{job\_id}/{table}` korrigieren

\* finalen Status auf `analysis\_done` / `downstream\_analysis` anpassen



\## 7. Erfüllung der Akzeptanzkriterien



Die Akzeptanzkriterien wurden bearbeitet:



\* Das Sequenzdiagramm wurde vollständig geprüft.

\* Die UML-/PlantUML-Notation wurde überprüft.

\* Die Systemabläufe wurden mit dem aktuellen Implementierungsstand abgeglichen.

\* Die Vollständigkeit wurde bewertet.

\* Die Verständlichkeit für neue Teammitglieder wurde bewertet.

\* Mängel und Verbesserungsvorschläge wurden dokumentiert.



