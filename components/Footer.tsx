import Link from "next/link";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t border-slate-200 pt-12 pb-8 text-sm">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-[#009966]">PDFy</span>
            <span className="text-[#999999] pl-2 border-l border-slate-300">
              &copy; {currentYear}
            </span>
          </div>


        </div>

        <div className="border-t border-slate-100 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-[#999999] text-xs">
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-[#009966]">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-[#009966]">Privacy Policy</Link>
            <Link href="/contact" className="hover:text-[#009966]">Contact</Link>
          </div>

          <p className="flex items-center gap-1">
            <span>By</span>
            <a href="#" className="text-[#666666] hover:text-[#009966] font-medium">Shreyas</a>
          </p>
        </div>
      </div>
    </footer>
  );
}

