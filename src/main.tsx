import { render } from 'preact'
import './styles/tokens.css'
import './styles/base.css'
import './styles/app.css'
import './styles/exercise.css'
import './styles/session.css'
import { App } from './app.tsx'

render(<App />, document.getElementById('app')!)
