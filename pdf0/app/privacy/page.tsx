export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-white pt-32 pb-16">
            <div className="container mx-auto px-4 max-w-3xl">
                <h1 className="text-3xl font-bold text-[#333333] mb-8">Privacy Policy</h1>

                <div className="prose prose-slate max-w-none text-[#666666]">
                    <p className="mb-4">Last updated: {new Date().toLocaleDateString()}</p>

                    <h2 className="text-xl font-bold text-[#333333] mt-8 mb-4">1. File Security</h2>
                    <p className="mb-4">
                        <strong>Your files never leave your computer.</strong> All PDF processing (merging, splitting, compressing, etc.) happens entirely within your web browser using locally running JavaScript code. We do not upload, store, or view your documents on any server.
                    </p>

                    <h2 className="text-xl font-bold text-[#333333] mt-8 mb-4">2. Data Collection</h2>
                    <p className="mb-4">
                        We do not collect any personal data, usage logs, or file metadata. The Service is designed to be completely anonymous and private.
                    </p>

                    <h2 className="text-xl font-bold text-[#333333] mt-8 mb-4">3. Local Storage</h2>
                    <p className="mb-4">
                        The Service may use your browser's local storage to save temporary preferences (like dark mode settings) but does not store any personal information.
                    </p>

                    <h2 className="text-xl font-bold text-[#333333] mt-8 mb-4">4. Third-Party Services</h2>
                    <p className="mb-4">
                        This website is hosted on a public platform. Please refer to the hosting provider's privacy policy for information regarding server logs.
                    </p>

                    <h2 className="text-xl font-bold text-[#333333] mt-8 mb-4">5. Contact</h2>
                    <p className="mb-4">
                        If you have any questions about this Privacy Policy, please contact us.
                    </p>
                </div>
            </div>
        </div>
    );
}
