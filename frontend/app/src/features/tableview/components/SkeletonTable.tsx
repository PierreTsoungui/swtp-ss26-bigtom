import {
    Skeleton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
} from "@mui/material";

/**
 * Props, die an die SkeletonTable-Komponente übergeben werden
 */
type SkeletonProps = {
    rows?: number;
    columns?: number;
}

/**
 * Komponent, die eine Skelett-Tabelle anzeigt, um den Ladezustand zu visualisieren.
 * @note Verbesserung der UX, da das Layout nicht verschoben wird, wenn Tabelle neu geladen wird
 * @param rows - Anzahl der Zeilen, die in der Skelett-Tabelle angezeigt werden sollen (Standard: 10)
 * @param columns - Anzahl der Spalten, die in der Skelett-Tabelle angezeigt werden sollen (Standard: 6)
 * @constructor
 */
function SkeletonTable({ rows = 10, columns = 6 }: SkeletonProps) {
    return (
        <TableContainer component={Paper} variant="outlined" sx={{ mt: 2 }}>
            <Table size="small">
                <TableHead>
                    <TableRow sx={{ backgroundColor: "grey.50" }}>
                        {Array.from({ length: columns }).map((_, i) => (
                            <TableCell key={i}>
                                <Skeleton variant="text" width="80%" />
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {Array.from({ length: rows }).map((_, rowIndex) => (
                        <TableRow key={rowIndex}>
                            {Array.from({ length: columns }).map((_, colIndex) => (
                                <TableCell key={colIndex}>
                                    <Skeleton variant="text" />
                                </TableCell>
                            ))}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

export default SkeletonTable;