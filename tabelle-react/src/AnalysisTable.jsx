/**
 * AnalysisTable.jsx
 *
 * Diese Komponente stellt eine wiederverwendbare Tabelle dar.
 * Sie empfängt Spaltennamen und Zeilendaten als Props
 * und rendert diese in einer formatierten HTML-Tabelle.
 */

import PropTypes from 'prop-types'

export default function AnalysisTable({ columns, rows }) {
  return (
    // Horizontales Scrollen bei zu vielen Spalten ermöglichen
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>

        {/* Tabellenkopf mit Spaltennamen */}
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                style={{ padding: '8px', border: '1px solid #ddd', background: '#3498db', color: 'white', textAlign: 'left' }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>

        {/* Tabelleninhalt mit allen Datenzeilen */}
        <tbody>
          {rows.map((row, rowIndex) => (
            // Abwechselnde Hintergrundfarbe für bessere Lesbarkeit
            <tr
              key={rowIndex}
              style={{ background: rowIndex % 2 === 1 ? '#f9f9f9' : 'white' }}
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  style={{ padding: '8px', borderBottom: '1px solid #ddd', textAlign: 'left' }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

      </table>
    </div>
  )
}

// Typüberprüfung der erwarteten Props
AnalysisTable.propTypes = {
  columns: PropTypes.arrayOf(PropTypes.string).isRequired, // Array von Spaltennamen (Strings)
  rows: PropTypes.arrayOf(PropTypes.array).isRequired,     // Array von Zeilen (jeweils ein Array)
}
