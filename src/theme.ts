import { createTheme } from '@mui/material/styles';

export const NERO = {
  paper: '#F5F2EC',
  paperDeep: '#EDE8DF',
  ink: '#17150F',
  muted: '#6F685C',
  line: 'rgba(20,18,15,0.10)',
  teal: '#6CA8C9',
  tealDeep: '#356F8F',
  dark: '#141210',
  danger: '#B3261E',
  dangerSoft: '#FDEEEB',
  success: '#1F7A55',
  successSoft: '#EEF7F2',
  warning: '#B7791F',
  warningSoft: '#FBF3E3',
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: NERO.tealDeep, light: NERO.teal, dark: '#27546B', contrastText: '#FFFFFF' },
    secondary: { main: NERO.teal },
    background: { default: NERO.paper, paper: '#FFFFFF' },
    text: { primary: NERO.ink, secondary: NERO.muted },
    divider: NERO.line,
    error: { main: NERO.danger },
    success: { main: NERO.success },
    warning: { main: NERO.warning },
  },
  shape: { borderRadius: 16 },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    h1: { fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 },
    h2: { fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1 },
    h3: { fontWeight: 700, letterSpacing: '-0.01em' },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.6 },
    button: { textTransform: 'none' as const, fontWeight: 700 },
    caption: { fontWeight: 600 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 22,
          minHeight: 42,
          transition: 'transform .2s, box-shadow .2s, background .2s',
        },
        sizeSmall: { minHeight: 34, paddingInline: 14, fontSize: 13 },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 24,
          border: `1px solid ${NERO.line}`,
          backgroundImage: 'none',
          boxShadow: '0 22px 50px -34px rgba(20,18,15,0.45)',
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 999, fontWeight: 600 },
        sizeSmall: { height: 24, fontSize: 11.5 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 700, minWidth: 90, paddingInline: 16 },
      },
    },
    MuiTabs: {
      styleOverrides: { indicator: { height: 3, borderRadius: 999 } },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { borderRadius: 14, backgroundColor: '#FFFFFF', fontSize: 14 },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          border: `1px solid ${NERO.line}`,
          backgroundImage: 'none',
          boxShadow: 'none',
          '&:before': { display: 'none' },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: { content: { fontWeight: 700, fontSize: 13.5 } },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: NERO.line, fontSize: 13 },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { borderRadius: 10, fontSize: 12, backgroundColor: NERO.dark },
      },
    },
  },
});

export default theme;
