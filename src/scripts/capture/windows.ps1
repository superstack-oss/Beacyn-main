#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Windows System Monitoring Agent

.DESCRIPTION
    Collects CPU, Memory, Disk, SMART, Network, and Docker metrics.
    Outputs JSON (can be sent to API or logs).
#>

param(
    [int]$Interval = 10
)

$ErrorActionPreference = "SilentlyContinue"

# ---------- OS INFO ----------
function Get-OSInfo {
    $os = Get-CimInstance Win32_OperatingSystem
    return @{
        platform = "Windows"
        name     = $os.Caption
        version  = $os.Version
        build    = $os.BuildNumber
    }
}

# ---------- CPU ----------
function Get-CPU {
    $cpuLoad = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
    $cpu = Get-CimInstance Win32_Processor

    return @{
        usage      = [int]$cpuLoad
        frequency  = $cpu.MaxClockSpeed
        cores      = $cpu.NumberOfCores
        logical    = $cpu.NumberOfLogicalProcessors
        temperature = Get-CPUTemp
    }
}

function Get-CPUTemp {
    try {
        $temp = Get-WmiObject MSAcpi_ThermalZoneTemperature -Namespace "root/wmi"
        return [math]::Round(($temp.CurrentTemperature - 2732) / 10, 2)
    } catch {
        return $null
    }
}

# ---------- MEMORY ----------
function Get-Memory {
    $os = Get-CimInstance Win32_OperatingSystem

    $total = [int64]$os.TotalVisibleMemorySize * 1KB
    $free  = [int64]$os.FreePhysicalMemory * 1KB
    $used  = $total - $free

    return @{
        total = $total
        free  = $free
        used  = $used
    }
}

# ---------- DISK ----------
function Get-Disk {
    $disks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3"

    $result = @()
    foreach ($d in $disks) {
        $result += @{
            drive = $d.DeviceID
            total = $d.Size
            free  = $d.FreeSpace
            used  = $d.Size - $d.FreeSpace
        }
    }

    return $result
}

# ---------- DISK IO ----------
function Get-DiskIO {
    $io = Get-Counter '\\PhysicalDisk(*)\\Disk Read Bytes/sec','\\PhysicalDisk(*)\\Disk Write Bytes/sec'
    return $io.CounterSamples | ForEach-Object {
        @{
            path = $_.Path
            value = [math]::Round($_.CookedValue,2)
        }
    }
}

# ---------- SMART ----------
function Get-SMART {
    try {
        $disks = Get-PhysicalDisk
        return $disks | Select FriendlyName, HealthStatus, OperationalStatus
    } catch {
        return $null
    }
}

# ---------- NETWORK ----------
function Get-Network {
    $adapters = Get-NetIPAddress | Where-Object {$_.AddressFamily -eq "IPv4"}
    return $adapters | Select InterfaceAlias, IPAddress
}

# ---------- DOCKER ----------
function Get-Docker {
    try {
        $output = docker stats --no-stream --format "{{json .}}"
        return $output
    } catch {
        return $null
    }
}

# ---------- MAIN ----------
function Collect-Metrics {
    $data = @{
        timestamp = (Get-Date).ToString("o")
        os        = Get-OSInfo
        cpu       = Get-CPU
        memory    = Get-Memory
        disk      = Get-Disk
        disk_io   = Get-DiskIO
        smart     = Get-SMART
        network   = Get-Network
        docker    = Get-Docker
    }

    $json = $data | ConvertTo-Json -Depth 5
    Write-Output $json
}

# ---------- LOOP ----------
while ($true) {
    Collect-Metrics
    Start-Sleep -Seconds $Interval
}