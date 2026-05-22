import { expect, test } from 'vitest'
import FileViewList  from '../components/FileViewList.tsx'
import { render, screen } from '@testing-library/react'

test('renders FileViewList with correct files', () => {
  const files = [
    new File(['content'], 'file1.txt', { type: 'text/plain' }),
    new File(['content'], 'file2.txt', { type: 'text/plain' }),
  ]

  render(<FileViewList files={files} errors={[]} onRemove={() => {}} />)

  expect(screen.getByText('file1.txt')).toBeInTheDocument()
  expect(screen.getByText('file2.txt')).toBeInTheDocument()
});