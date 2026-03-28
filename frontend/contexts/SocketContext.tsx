"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"
import { Socket } from "socket.io-client"
import { getSocket } from "@/lib/socket"

interface SocketContextValue {
  socket: Socket
  isConnected: boolean
}

const SocketContext = createContext<SocketContextValue | null>(null)

export function SocketProvider({ children }: { children: ReactNode }) {
  const socket = getSocket()
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    socket.connect()

    socket.on("connect", () => setIsConnected(true))
    socket.on("disconnect", () => setIsConnected(false))
    socket.on("connect_error", () => setIsConnected(false))

    return () => {
      socket.off("connect")
      socket.off("disconnect")
      socket.off("connect_error")
    }
  }, [socket])

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const ctx = useContext(SocketContext)
  if (!ctx) throw new Error("useSocket must be used within SocketProvider")
  return ctx
}
