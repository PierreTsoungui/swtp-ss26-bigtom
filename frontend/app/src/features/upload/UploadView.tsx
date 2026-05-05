import { useRef, useState } from "react";
    
function UploadView() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [fileList, setFileList] = useState<File[]>([]);
    const [sampleSheetFile, setSampleSheetFile] = useState<File | null>(null);

    const handleFileSelect = () => {
        console.log("Select button clicked");
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleFileSampleSheetSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        console.log("Select Sample Sheet button clicked");
        const file = event.target.files?.[0];
        if (file) {
            setSampleSheetFile(file);
        }
    }

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            console.log("Selected file:", file.name);
            setFileList((prevList) => [...prevList, file]);
        }
    };

    const onRemoveFile = (fileName: string) => {
        setFileList((prevList) => prevList.filter((file) => file.name !== fileName));
    };

  return (
    <>
    <div className="container mx-auto">
        <h1 className="text-4xl font-bold text-center m-10">Upload</h1>
        <div className="flex flex-row bg-slate-200 justify-center">
            <div className="flex flex-col">
                <label className="cursor-pointer bg-slate-400 hover:bg-slate-500 rounded-full m-20 p-4 px-8">
                Select
                <input type="file" className="hidden" onChange={handleFileChange} />
                </label>
                <p className="text-sm"><b>Allowed file types:</b> *.idat</p>
            </div>
            <div className="flex flex-col">
                <label className="cursor-pointer bg-slate-400 hover:bg-slate-500 rounded-full m-20 p-4 px-8">
                Select Sample Sheet
                <input type="file" className="hidden" onChange={handleFileSampleSheetSelect} />
                </label>
                <p className="text-sm"><b>Allowed file types:</b> *.csv, *.xlsx</p>
            </div>

        </div>
        <div className="m-10">
            <h2 className="text-2xl font-bold m-5">Selected Files</h2>
            <ul>
                {fileList.map((file, index) => (
                    <li key={index} className="m-2">
                        {file.name}
                    </li>
                ))}
            </ul>
        </div>



    </div>


    </>
  );
}

export default UploadView;
