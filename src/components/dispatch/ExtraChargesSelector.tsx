'use client'

import React, { useState, useEffect } from 'react'

interface ExtraChargesSelectorProps {
  stopFee?: number
  waitingFeePer15m?: number
  initialExtraCharges?: number
  onChange: (totalExtra: number, details: { stops: number; waitMins: number; custom: number }) => void
  className?: string
  compact?: boolean
}

export default function ExtraChargesSelector({
  stopFee = 3.0,
  waitingFeePer15m = 2.5,
  initialExtraCharges = 0,
  onChange,
  className = '',
  compact = false
}: ExtraChargesSelectorProps) {
  const [stops, setStops] = useState(0)
  const [waitMins, setWaitMins] = useState(0)
  const [customExtra, setCustomExtra] = useState(0)

  // Sync if initialExtraCharges is passed initially without breakdown
  useEffect(() => {
    if (initialExtraCharges > 0 && stops === 0 && waitMins === 0 && customExtra === 0) {
      setCustomExtra(initialExtraCharges)
    }
  }, [initialExtraCharges])

  // Recalculate whenever stops, waitMins, or customExtra change
  const updateTotals = (newStops: number, newWaitMins: number, newCustom: number) => {
    const stopsTotal = newStops * (Number(stopFee) || 0)
    const waitUnits = Math.ceil(newWaitMins / 15)
    const waitTotal = waitUnits * (Number(waitingFeePer15m) || 0)
    const total = Number((stopsTotal + waitTotal + (Number(newCustom) || 0)).toFixed(2))

    onChange(total, {
      stops: newStops,
      waitMins: newWaitMins,
      custom: newCustom
    })
  }

  const handleStopChange = (delta: number) => {
    const next = Math.max(0, stops + delta)
    setStops(next)
    updateTotals(next, waitMins, customExtra)
  }

  const handleWaitChange = (deltaMins: number) => {
    const next = Math.max(0, waitMins + deltaMins)
    setWaitMins(next)
    updateTotals(stops, next, customExtra)
  }

  const handleCustomChange = (val: number) => {
    const next = Math.max(0, val)
    setCustomExtra(next)
    updateTotals(stops, waitMins, next)
  }

  const stopsTotal = stops * (Number(stopFee) || 0)
  const waitTotal = Math.ceil(waitMins / 15) * (Number(waitingFeePer15m) || 0)
  const calculatedTotal = Number((stopsTotal + waitTotal + customExtra).toFixed(2))

  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-950/70 p-3.5 space-y-3 ${className}`}>
      <div className="flex justify-between items-center">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Extra Stops & Wait Time
        </span>
        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
          +${calculatedTotal.toFixed(2)} Extra
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {/* Extra Stops Stepper */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-2.5 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-gray-800 dark:text-gray-200">Extra Stops</div>
            <div className="text-[10px] text-gray-400">+${Number(stopFee || 0).toFixed(2)} / stop</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleStopChange(-1)}
              disabled={stops === 0}
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed font-black text-sm flex items-center justify-center transition-colors"
            >
              -
            </button>
            <span className="w-5 text-center font-bold text-sm text-gray-900 dark:text-white">
              {stops}
            </span>
            <button
              type="button"
              onClick={() => handleStopChange(1)}
              className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-black text-sm flex items-center justify-center transition-colors shadow-sm"
            >
              +
            </button>
          </div>
        </div>

        {/* Wait Time Stepper (+15m) */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-2.5 flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-gray-800 dark:text-gray-200">Waiting Time</div>
            <div className="text-[10px] text-gray-400">+${Number(waitingFeePer15m || 0).toFixed(2)} / 15 min</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleWaitChange(-15)}
              disabled={waitMins === 0}
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed font-black text-sm flex items-center justify-center transition-colors"
            >
              -
            </button>
            <span className="w-12 text-center font-bold text-xs text-gray-900 dark:text-white">
              {waitMins}m
            </span>
            <button
              type="button"
              onClick={() => handleWaitChange(15)}
              className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center transition-colors shadow-sm"
              title="Add 15 minutes wait"
            >
              +15m
            </button>
          </div>
        </div>
      </div>

      {/* Optional Custom Extra Input */}
      {!compact && (
        <div className="flex justify-between items-center pt-2 border-t border-gray-200 dark:border-gray-800 text-xs">
          <span className="text-gray-500">Other custom extra (Toll, etc):</span>
          <div className="flex items-center gap-1">
            <span className="text-gray-400">$</span>
            <input
              type="number"
              step="0.5"
              min="0"
              value={customExtra === 0 ? '' : customExtra}
              placeholder="0.00"
              onChange={(e) => handleCustomChange(parseFloat(e.target.value) || 0)}
              className="w-20 px-2 py-1 border rounded bg-white dark:bg-gray-900 dark:border-gray-700 text-right text-xs font-semibold text-gray-800 dark:text-gray-200"
            />
          </div>
        </div>
      )}
    </div>
  )
}
