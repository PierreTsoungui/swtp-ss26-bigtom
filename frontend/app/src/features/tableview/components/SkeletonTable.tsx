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
 * Props for the SkeletonTable component.
 */
type SkeletonProps = {
    /**
     * Number of placeholder rows to display.
     * @default 10
     */
    rows?: number;

    /** Number of placeholder columns to display.
     * @default 6
     */
    columns?: number;
}

/**
 * A placeholder component that renders a skeleton UI for tables.
 *
 * It improves user experience by maintaining layout stability and preventing
 * cumulative layout shifts (CLS) while table data is being fetched.
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