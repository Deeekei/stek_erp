import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard.jsx'; // <-- Наш новый дашборд
import Projects from './components/Projects';
import ProjectDetail from './components/ProjectDetail';
import MyTasks from './components/MyTasks';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
  };

  if (!token) {
    return <Login onLoginSuccess={setToken} />;
  }

  return (
    <BrowserRouter>
      <Layout onLogout={handleLogout}>
        <Routes>
          {/* Главная страница теперь указывает на наш новый Dashboard */}
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="*" element={<Navigate to="/" />} />
          <Route path="/my-tasks" element={<MyTasks />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;