using System;
using System.IO;
using System.Runtime.InteropServices;

internal static class Program
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    private class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    private static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    private static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    private static int Main(string[] args)
    {
        if (args == null || args.Length < 2)
        {
            Console.Error.WriteLine("Usage: raw-print.exe <printerName> <filePath>");
            return 1;
        }

        var printerName = args[0];
        var filePath = args[1];
        if (!File.Exists(filePath))
        {
            Console.Error.WriteLine("Raw print file not found: " + filePath);
            return 2;
        }

        var bytes = File.ReadAllBytes(filePath);
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
        {
            Console.Error.WriteLine("OpenPrinter failed: " + Marshal.GetLastWin32Error());
            return 3;
        }

        try
        {
            var di = new DOCINFOA();
            di.pDocName = "North Bike Ticket";
            di.pDataType = "RAW";
            if (!StartDocPrinter(hPrinter, 1, di))
            {
                Console.Error.WriteLine("StartDocPrinter failed: " + Marshal.GetLastWin32Error());
                return 4;
            }

            try
            {
                if (!StartPagePrinter(hPrinter))
                {
                    Console.Error.WriteLine("StartPagePrinter failed: " + Marshal.GetLastWin32Error());
                    return 5;
                }

                try
                {
                    var unmanaged = Marshal.AllocCoTaskMem(bytes.Length);
                    Marshal.Copy(bytes, 0, unmanaged, bytes.Length);
                    int written;
                    var ok = WritePrinter(hPrinter, unmanaged, bytes.Length, out written);
                    Marshal.FreeCoTaskMem(unmanaged);
                    if (!ok)
                    {
                        Console.Error.WriteLine("WritePrinter failed: " + Marshal.GetLastWin32Error());
                        return 6;
                    }
                    if (written != bytes.Length)
                    {
                        Console.Error.WriteLine("WritePrinter partial: " + written + "/" + bytes.Length);
                        return 7;
                    }
                }
                finally
                {
                    EndPagePrinter(hPrinter);
                }
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            ClosePrinter(hPrinter);
        }

        Console.WriteLine("RAW sent " + bytes.Length + " bytes to " + printerName);
        return 0;
    }
}
