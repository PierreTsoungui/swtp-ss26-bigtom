import React, { useState } from 'react';
import type { BatchRound } from '../utils/types';
import { colors } from '../../../shared/theme/colors';
import {
    Box,
    Dialog,
    Fade,
    IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import NavigateBefore from "@mui/icons-material/NavigateBefore";
import NavigateNext from "@mui/icons-material/NavigateNext";
import ZoomIn from "@mui/icons-material/ZoomIn";

export interface SvdPlotProps {
    rounds: BatchRound[];
}

export const SvdPlot: React.FC<SvdPlotProps> = ({ rounds }) => {
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

    const isOpen = selectedIndex !== null;
    const handleOpen  = (index: number) => setSelectedIndex(index);
    const handleClose = () => setSelectedIndex(null);

    const handlePrev = () =>
        setSelectedIndex((prev) =>
            prev !== null ? (prev - 1 + rounds.length) % rounds.length : 0
        );

    const handleNext = () =>
        setSelectedIndex((prev) =>
            prev !== null ? (prev + 1) % rounds.length : 0
        );

    // Pfeiltasten-Navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowLeft")  handlePrev();
        if (e.key === "ArrowRight") handleNext();
        if (e.key === "Escape")     handleClose();
    };

    if (rounds.length === 0) return <p>No SVD plots available.</p>;

    return (
        <div onKeyDown={handleKeyDown}>
            <h3>SVD Diagnostic Plots</h3>

            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {rounds.map((round: BatchRound, index: number) => (
                    <div
                        key={round.round}
                        style={{
                            flex: '0 1 400px',
                            border: `1px solid ${colors.neutral.borderDefault}`,
                            padding: '15px',
                            borderRadius: '8px',
                            backgroundColor:
                                round.type === 'initial'
                                    ? colors.neutral.background
                                    : colors.success.badgeBackground,
                        }}
                    >
                        {/* Titel */}
                        <h4 style={{ margin: '0 0 10px 0', color: colors.neutral.textPrimary }}>
                            {round.type === 'initial' ? 'Before Correction' : 'After Correction'}{' '}
                            (Round {round.round})
                        </h4>

                        {/* Bild mit Zoom-Overlay */}
                        <div
                            style={{ position: 'relative', cursor: 'pointer' }}
                            onClick={() => handleOpen(index)}
                        >
                            <img
                                src={round.svd_plot}
                                alt={`SVD Plot Round ${round.round}`}
                                style={{
                                    width: '100%',
                                    height: 'auto',
                                    display: 'block',
                                    borderRadius: '4px',
                                    marginBottom: '10px',
                                }}
                            />
                            {/* Hover-Overlay */}
                            <Box
                                sx={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    bgcolor: 'rgba(0,0,0,0)',
                                    borderRadius: '4px',
                                    transition: 'background-color 0.2s',
                                    '&:hover': { bgcolor: 'rgba(0,0,0,0.25)' },
                                    '&:hover .zoom-icon': { opacity: 1 },
                                }}
                            >
                                <ZoomIn
                                    className="zoom-icon"
                                    sx={{
                                        opacity: 0,
                                        color: '#fff',
                                        fontSize: 40,
                                        transition: 'opacity 0.2s',
                                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
                                    }}
                                />
                            </Box>
                        </div>

                        {/* Infos */}
                        <div
                            style={{
                                fontSize: '0.9em',
                                color: colors.neutral.textSecondary,
                                borderTop: `1px solid ${colors.neutral.borderDefault}`,
                                paddingTop: '10px',
                            }}
                        >
                            <div style={{ marginBottom: '8px' }}>
                                <strong>Timestamp:</strong>{' '}
                                {new Date(round.timestamp).toLocaleString('de-DE')}
                            </div>

                            {round.settings_used && (
                                <>
                                    <div style={{ marginBottom: '8px' }}>
                                        <strong>Batch Variable:</strong>{' '}
                                        {round.settings_used.batch_variable}
                                    </div>
                                    <div>
                                        <strong>Covariates:</strong>{' '}
                                        {round.settings_used.covariates.length > 0
                                            ? round.settings_used.covariates.join(', ')
                                            : 'None'}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Lightbox Dialog ─────────────────────────────────── */}
            <Dialog
                open={isOpen}
                onClose={handleClose}
                slots={{
                    transition: Fade
                }}
                slotProps={{
                    backdrop: { onClick: handleClose },
                    transition: { timeout: 300 },
                    paper: {
                        sx: {
                            bgcolor: 'transparent',
                            boxShadow: 'none',
                            overflow: 'visible',
                        },
                    },
                }}
                maxWidth="xl"
                fullWidth
            >
                {isOpen && selectedIndex !== null && (
                    <Box
                        sx={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            p: 4,
                        }}
                    >
                        {/* Schließen */}
                        <IconButton
                            onClick={handleClose}
                            sx={{
                                position: 'absolute',
                                top: -16,
                                right: -16,
                                color: '#fff',
                                bgcolor: 'rgba(0,0,0,0.5)',
                                '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' },
                                zIndex: 10,
                            }}
                        >
                            <CloseIcon />
                        </IconButton>

                        {/* Pfeil links */}
                        {rounds.length > 1 && (
                            <IconButton
                                onClick={handlePrev}
                                sx={{
                                    position: 'absolute',
                                    left: -24,
                                    color: '#fff',
                                    bgcolor: 'rgba(0,0,0,0.4)',
                                    '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
                                }}
                            >
                                <NavigateBefore fontSize="large" />
                            </IconButton>
                        )}

                        {/* Bild */}
                        <Box
                            component="img"
                            src={rounds[selectedIndex].svd_plot}
                            alt={`SVD Plot Round ${rounds[selectedIndex].round}`}
                            sx={{
                                maxWidth: '90vw',
                                maxHeight: '85vh',
                                objectFit: 'contain',
                                borderRadius: '4px',
                                bgcolor: '#fff',
                                boxShadow: 24,
                            }}
                        />

                        {/* Bildnummer */}
                        <Box
                            sx={{
                                position: 'absolute',
                                bottom: 8,
                                left: '50%',
                                transform: 'translateX(-50%)',
                                color: '#fff',
                                bgcolor: 'rgba(0,0,0,0.45)',
                                borderRadius: '12px',
                                px: 2,
                                py: 0.5,
                                fontSize: '0.85rem',
                            }}
                        >
                            {selectedIndex + 1} / {rounds.length}
                        </Box>

                        {/* Pfeil rechts */}
                        {rounds.length > 1 && (
                            <IconButton
                                onClick={handleNext}
                                sx={{
                                    position: 'absolute',
                                    right: -24,
                                    color: '#fff',
                                    bgcolor: 'rgba(0,0,0,0.4)',
                                    '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
                                }}
                            >
                                <NavigateNext fontSize="large" />
                            </IconButton>
                        )}
                    </Box>
                )}
            </Dialog>
        </div>
    );
};
