import { useState } from 'react'

import './App.css'


/**
 * Diese Komponente nur nutzen, um die Navigierung der Pages mittels
 * React-Router zu managen und zu den entsprechenden Komponenten zu leiten
 * die im feautes ordner definiert sind
 * @returns 
 */
function App() {
  const [count, setCount] = useState(0)

  const increment = () => {
    setCount(count + 1);
  }

  return (
    <>
      {/* This is only example code... */}
      <p className="text-3xl font-bold underline">Counter: {count}</p>
      <button className="mt-3 p-2 bg-sky-500 rounded-2xl"onClick={increment}>Increment</button>
    </>
  )
}

export default App
