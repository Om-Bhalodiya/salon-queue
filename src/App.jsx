import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import { ToastProvider } from './context/ToastContext';

import Home from './pages/Home';
import Join from './pages/Join';
import Status from './pages/Status';
import Reception from './pages/Reception';
import Barber from './pages/Barber';
import Display from './pages/Display';
import Admin from './pages/Admin';

export default function App() {
  return (
    <LanguageProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/join" element={<Join />} />
            <Route path="/status/:id" element={<Status />} />
            <Route path="/reception" element={<Reception />} />
            <Route path="/barber/:name" element={<Barber />} />
            <Route path="/display" element={<Display />} />
            <Route path="/admin" element={<Admin />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </LanguageProvider>
  );
}
