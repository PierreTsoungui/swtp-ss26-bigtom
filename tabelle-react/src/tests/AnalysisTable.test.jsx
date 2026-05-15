/**
 * AnalysisTable.test.jsx
 *
 * Diese Datei enthält Unit-Tests für die AnalysisTable-Komponente.
 * Es wird geprüft, ob Spalten und Zeilen korrekt gerendert werden.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AnalysisTable from '@/components/AnalysisTable'

describe('AnalysisTable', () => {
  // Testdaten: 3 Spalten und 2 Datenzeilen
  const columns = ['A', 'B', 'C']
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
  ]

  // Test 1: Prüft ob alle Spaltenüberschriften korrekt angezeigt werden
  it('renders all columns', () => {
    render(<AnalysisTable columns={columns} rows={rows} />)

    const ths = screen.getAllByRole('columnheader')
    expect(ths).toHaveLength(3)         // Genau 3 Spalten erwartet
    expect(ths[0]).toHaveTextContent('A')
    expect(ths[1]).toHaveTextContent('B')
    expect(ths[2]).toHaveTextContent('C')
  })

  // Test 2: Prüft ob alle Zeilen und Zellen korrekt gerendert werden
  it('renders all rows and cells', () => {
    render(<AnalysisTable columns={columns} rows={rows} />)

    const rows = screen.getAllByRole('row')
    // rows[0] = Kopfzeile, rows[1] = erste Datenzeile, rows[2] = zweite Datenzeile
    const dataTrs = rows.slice(1)       // Kopfzeile überspringen
    expect(dataTrs).toHaveLength(2)     // Genau 2 Datenzeilen erwartet

    const firstRowCells = dataTrs[0].querySelectorAll('td')
    expect(firstRowCells).toHaveLength(3) // Erste Zeile hat 3 Zellen

    const secondRowCells = dataTrs[1].querySelectorAll('td')
    expect(secondRowCells[2]).toHaveTextContent('6') // Letzte Zelle der zweiten Zeile = '6'
  })
})
