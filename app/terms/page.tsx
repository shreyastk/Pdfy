export default function TermsPage() {
    return (
        <div className="min-h-screen bg-white pt-32 pb-16">
            <div className="container mx-auto px-4 max-w-3xl">
                <h1 className="text-3xl font-bold text-[#333333] mb-8">Terms of Service</h1>

                <div className="prose prose-slate max-w-none text-[#666666]">
                    <p className="mb-4">Last updated: {new Date().toLocaleDateString()}</p>

                    <h2 className="text-xl font-bold text-[#333333] mt-8 mb-4">1. Acceptance of Terms</h2>
                    <p className="mb-4">
                        By accessing and using PDFy ("the Service"), you accept and agree to be bound by the terms and provision of this agreement.
                    </p>

                    <h2 className="text-xl font-bold text-[#333333] mt-8 mb-4">2. Description of Service</h2>
                    <p className="mb-4">
                        PDFy provides free online PDF tools including merging, splitting, compressing, and editing PDF files. The Service is provided "as is" and is accessible via a web browser.
                    </p>

                    <h2 className="text-xl font-bold text-[#333333] mt-8 mb-4">3. User Conduct</h2>
                    <p className="mb-4">
                        All file processing is performed locally in your browser. We do not upload your files to our servers. You are solely responsible for the content of the files you process using our Service.
                    </p>

                    <h2 className="text-xl font-bold text-[#333333] mt-8 mb-4">4. Privacy</h2>
                    <p className="mb-4">
                        Your privacy is important to us. Please review our Privacy Policy to understand how we handle your information.
                    </p>

                    <h2 className="text-xl font-bold text-[#333333] mt-8 mb-4">5. Disclaimer</h2>
                    <p className="mb-4">
                        The Service is provided without warranties of any kind. We are not liable for any damages or data loss resulting from the use of our Service.
                    </p>
                </div>
            </div>
        </div>
    );
}
