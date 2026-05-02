import { useState } from "react";

function MyCounter() {
      const [count, setCount] = useState(0)
    
      const increment = () => {
        setCount(count + 1);
      }
    return (
        <div>
            <p className="text-3xl font-bold underline">Counter: {count}</p>
            <button className="mt-3 p-2 bg-sky-500 rounded-2xl" onClick={increment}>Increment</button>
        </div>
    )
}

export default MyCounter;