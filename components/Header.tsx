import { auth } from "@/auth";
import AuthButton from "@/components/AuthButton";

export default async function Header() {
  const session = await auth();

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-gray-800">
            Drive → Photos Uploader
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {session?.user && (
            <div className="flex items-center gap-3">
              {session.user.image && (
                <img
                  src={session.user.image}
                  alt={session.user.name || "User"}
                  className="w-8 h-8 rounded-full"
                />
              )}
              <span className="text-sm text-gray-700 hidden sm:block">
                {session.user.email}
              </span>
            </div>
          )}
          <AuthButton />
        </div>
      </div>
    </header>
  );
}
