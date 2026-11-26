import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Spinner } from './components/ui'
import Home from './pages/Home'

const Account = lazy(() => import('./pages/Account'))
const Advisor = lazy(() => import('./pages/Advisor'))
const Assessment = lazy(() => import('./pages/Assessment'))
const Careers = lazy(() => import('./pages/Careers'))
const CareerDetail = lazy(() => import('./pages/CareerDetail'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Explore = lazy(() => import('./pages/Explore'))
const Goal = lazy(() => import('./pages/Goal'))
const Login = lazy(() => import('./pages/Login'))
const Roadmap = lazy(() => import('./pages/Roadmap'))
const SkillGap = lazy(() => import('./pages/SkillGap'))

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollTop />
      <Routes>
        <Route
          path="/login"
          element={
            <Suspense fallback={<Spinner />}>
              <Login />
            </Suspense>
          }
        />
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/assessment" element={<Assessment />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/careers/:code" element={<CareerDetail />} />
          <Route path="/goal" element={<Goal />} />
          <Route path="/explore" element={<Explore />} />
          <Route path="/skill-gap" element={<SkillGap />} />
          <Route path="/roadmap" element={<Roadmap />} />
          <Route path="/advisor" element={<Advisor />} />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <Account />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Home />} />
        </Route>
      </Routes>
    </>
  )
}
