type Props = {

  data: any;

};



export function AnalysisTable({ data }: Props) {

  if (!data) {

    return (

      <div className="text-center py-12 bg-gray-50 rounded-md border border-gray-200">

        <p className="text-gray-500">Keine Daten vorhanden.</p>

      </div>

    );

  }



  return (

    <div>

      {/* Table */}

      <div className="overflow-auto border border-gray-200 rounded-md">

        <table className="w-full text-sm">

          <thead className="bg-gray-50 border-b border-gray-200">

            <tr>

              {data.columns.map((column: any) => (

                <th

                  key={column.key}

                  className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider"

                >

                  {column.label}

                </th>

              ))}

            </tr>

          </thead>

          <tbody className="divide-y divide-gray-100">

            {data.data.map((row: any, index: number) => (

              <tr key={index} className="hover:bg-gray-50">

                {data.columns.map((column: any) => (

                  <td

                    key={column.key}

                    className="px-4 py-3 text-gray-700"

                  >

                    {formatCellValue(row[column.key], column.type)}

                  </td>

                ))}

              </tr>

            ))}

          </tbody>

        </table>

      </div>



      {/* Pagination - falls vorhanden */}

      {data.pagination && data.pagination.total_pages > 1 && (

        <div className="mt-4 flex justify-between items-center text-sm text-gray-600">

          <span>

            Seite {data.pagination.page} von {data.pagination.total_pages}

          </span>

          <div className="flex gap-2">

            <button className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">

              Zurück

            </button>

            <button className="px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50">

              Weiter

            </button>

          </div>

        </div>

      )}

    </div>

  );

}


function formatCellValue(value: any, type: string): string {

  if (value === null || value === undefined) {

    return '—';

  }


  if (type === 'float') {

    if (typeof value === 'number') {

      if (Math.abs(value) < 0.0001 && value !== 0) {

        return value.toExponential(4);

      }

      // Auf 4 Dezimalstellen gerundet, ohne unnötige Nullen

      const formatted = value.toFixed(4).replace(/\.?0+$/, '');

      return formatted || '0';

    }

    return String(value);

  }

  

  return String(value);

}