export default function ContactPage() {
    return (
        <div className="min-h-screen bg-white pt-32 pb-16">
            <div className="container mx-auto px-4 max-w-2xl text-center">
                <h1 className="text-3xl font-bold text-[#333333] mb-8">Contact Us</h1>

                <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100 shadow-sm inline-block w-full max-w-md">
                    <p className="text-[#666666] mb-6">
                        Have questions, suggestions, or feedback? We'd love to hear from you.
                    </p>

                    <div className="space-y-4">
                        <div>
                            <p className="text-sm font-semibold text-[#999999] uppercase tracking-wider mb-1">Created By</p>
                            <p className="text-lg font-bold text-[#333333]">Shreyas</p>
                        </div>

                        <div className="pt-4 border-t border-slate-200">
                            <p className="text-sm font-semibold text-[#999999] uppercase tracking-wider mb-1">Email</p>
                            <a
                                href="mailto:shreyas7326@gmail.com"
                                className="text-lg font-bold text-[#009966] hover:underline"
                            >
                                shreyas7326@gmail.com
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
